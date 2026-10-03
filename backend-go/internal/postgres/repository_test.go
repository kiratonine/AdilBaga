package postgres

import (
	"encoding/json"
	"testing"

	"adilbaga/backend-go/internal/catalog"
)

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
