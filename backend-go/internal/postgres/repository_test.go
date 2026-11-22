package postgres

import (
	"encoding/json"
	"reflect"
	"testing"

	"adilbaga/backend-go/internal/catalog"
)

func TestBrandOptions(t *testing.T) {
	configured := []json.RawMessage{
		json.RawMessage(`"BARAKA"`), json.RawMessage(`"Baraka"`), json.RawMessage(`"3 желания"`),
		json.RawMessage(`"ACTIMEL KIDS"`), json.RawMessage(`"ACTIMEL"`), json.RawMessage(`"stale"`),
		json.RawMessage(`true`), json.RawMessage(`0`), json.RawMessage(`null`), json.RawMessage(`""`),
		json.RawMessage(`"  "`), json.RawMessage(`"F_O%"`), json.RawMessage(`"3ABC   ÉCLAIR-DEKMY"`),
	}
	actual := []json.RawMessage{
		json.RawMessage(`"baraka"`), json.RawMessage(`"3 ЖЕЛАНИЯ"`), json.RawMessage(`"Actimel"`),
		json.RawMessage(`"actimel kids"`), json.RawMessage(`"unconfigured"`), json.RawMessage(`"f_o%"`),
		json.RawMessage(`"3abc   éclair-dekmy"`), json.RawMessage(`"0"`), json.RawMessage(`"true"`),
		json.RawMessage(`null`), json.RawMessage(`""`), json.RawMessage(`"  "`),
	}
	want := []json.RawMessage{
		json.RawMessage(`"Baraka"`), json.RawMessage(`"3 Желания"`), json.RawMessage(`"Actimel Kids"`),
		json.RawMessage(`"Actimel"`), json.RawMessage(`"F_o%"`), json.RawMessage(`"3Abc   Éclair-dekmy"`),
	}
	if got := brandOptions(configured, actual); !reflect.DeepEqual(got, want) {
		t.Fatalf("options = %s, want %s", got, want)
	}
}

func TestDefinitionsAndScalarTypes(t *testing.T) {
	raw := []byte(`{"filters":[{"key":"n","label":"N","type":"multi-select","options":[1000,"1000",true,null,{},[]]},{"key":"b","label":"B","type":"boolean"},{"key":"x","label":"X","type":"multi-select"},{"key":7,"label":"X","type":"boolean"}]}`)
	defs := definitions(raw)
	if len(defs) != 2 || len(defs[0].Options) != 3 || defs[1].Options != nil {
		t.Fatal("invalid definitions or primitive types")
	}
	if equalPrimitive(json.RawMessage(`1000`), json.RawMessage(`"1000"`)) || !equalPrimitive(json.RawMessage(`1000`), json.RawMessage(`1000.0`)) {
		t.Fatal("typed equality changed")
	}
	attrs := scalarAttributes([]byte(`{"n":1000,"s":"1000","b":true,"null":null,"object":{},"array":[]}`))
	if len(attrs) != 4 || string(attrs["n"]) != "1000" || string(attrs["b"]) != "true" {
		t.Fatal("scalar mapping")
	}
	for _, raw := range []string{`null`, `[]`, `{"filters":false}`, `{"filters":[null,false,7]}`} {
		if len(definitions([]byte(raw))) != 0 {
			t.Fatal("malformed schema accepted")
		}
	}
}
func TestSortAllowlist(t *testing.T) {
	for _, sort := range []catalog.Sort{"", catalog.PriceAsc, catalog.PriceDesc, catalog.NameAsc} {
		if _, err := sortSQL(sort); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := sortSQL(`name; DROP TABLE offers`); err != catalog.ErrInvalidQuery {
		t.Fatal("untrusted sort accepted")
	}
}
