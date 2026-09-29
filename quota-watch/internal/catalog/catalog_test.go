package catalog

import "testing"

func TestTierAIsBroadStableAndCopied(t *testing.T) {
	a, b := TierA(), TierA()
	if a.Version == "" || len(a.Entries) < 30 {
		t.Fatalf("catalogue %q has %d entries", a.Version, len(a.Entries))
	}
	seen := map[string]bool{}
	for _, e := range a.Entries {
		if e.ID == "" || seen[e.ID] || e.Privacy != "local_metadata" {
			t.Fatalf("invalid entry %+v", e)
		}
		seen[e.ID] = true
	}
	a.Entries[0].Name = "changed"
	if b.Entries[0].Name == "changed" {
		t.Fatal("entry slice was not copied")
	}
}
