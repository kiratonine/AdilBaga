package ingestion

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type batchTestTx struct {
	pgx.Tx
	batches [][]int
	results *batchTestResults
}

func (tx *batchTestTx) SendBatch(_ context.Context, batch *pgx.Batch) pgx.BatchResults {
	values := []int{}
	for _, q := range batch.QueuedQueries {
		if q.SQL != "test-statement" || len(q.Arguments) != 1 {
			panic("test statement changed")
		}
		values = append(values, q.Arguments[0].(int))
	}
	tx.batches = append(tx.batches, values)
	return tx.results
}

type batchTestResults struct {
	pgx.BatchResults
	tag      pgconn.CommandTag
	execErr  error
	closeErr error
	execs    int
	closes   int
}

func (r *batchTestResults) Exec() (pgconn.CommandTag, error) {
	r.execs++
	return r.tag, r.execErr
}
func (r *batchTestResults) Close() error { r.closes++; return r.closeErr }

func TestTxBatchBoundariesAndOrder(t *testing.T) {
	r := &batchTestResults{tag: pgconn.NewCommandTag("INSERT 0 1")}
	tx := &batchTestTx{results: r}
	b := &txBatch{tx: tx}
	ctx := t.Context()
	if b.flush(ctx) != nil || len(tx.batches) != 0 {
		t.Fatal("empty batch must not be sent")
	}
	for i := 0; i <= batchSize; i++ {
		if err := b.queue(ctx, "test-statement", i); err != nil {
			t.Fatal(err)
		}
	}
	if len(tx.batches) != 1 || len(tx.batches[0]) != batchSize || b.batch.Len() != 1 {
		t.Fatal("full batch/tail boundary differs")
	}
	if err := b.flush(ctx); err != nil {
		t.Fatal(err)
	}
	want := make([]int, batchSize+1)
	for i := range want {
		want[i] = i
	}
	got := append(append([]int{}, tx.batches[0]...), tx.batches[1]...)
	if !reflect.DeepEqual(got, want) || r.execs != batchSize+1 || r.closes != 2 || b.batch.Len() != 0 {
		t.Fatal("batch statement/argument order, drain or reset changed")
	}
}

func TestTxBatchFailsClosed(t *testing.T) {
	sentinel := errors.New("test failure")
	for _, tt := range []struct {
		name string
		r    batchTestResults
	}{
		{"zero affected", batchTestResults{tag: pgconn.NewCommandTag("UPDATE 0")}},
		{"multiple affected", batchTestResults{tag: pgconn.NewCommandTag("UPDATE 2")}},
		{"statement error", batchTestResults{execErr: sentinel}},
		{"close error", batchTestResults{tag: pgconn.NewCommandTag("INSERT 0 1"), closeErr: sentinel}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			b := &txBatch{tx: &batchTestTx{results: &tt.r}}
			if err := b.queue(context.Background(), "test-statement", 0); err != nil {
				t.Fatal(err)
			}
			if b.flush(t.Context()) == nil || tt.r.closes != 1 || b.batch.Len() != 0 {
				t.Fatal("batch failure swallowed or results not closed/reset")
			}
		})
	}
}
