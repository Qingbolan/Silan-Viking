package traffic

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPlaceResolverFindsNearestPlaceInCountry(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cities500.txt")
	data := "" +
		"1880252\tSingapore\tSingapore\t\t1.28967\t103.85007\tP\tPPLC\tSG\t\t00\t\t\t5638700\t\t23\tAsia/Singapore\t2024-01-01\n" +
		"1880756\tHolland Village\tHolland Village\t\t1.31139\t103.79639\tP\tPPLX\tSG\t\t00\t\t\t9000\t\t12\tAsia/Singapore\t2024-01-01\n" +
		"5128581\tNew York City\tNew York City\t\t40.71427\t-74.00597\tP\tPPL\tUS\t\tNY\t\t\t8804190\t\t57\tAmerica/New_York\t2024-01-01\n"
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		t.Fatal(err)
	}

	resolver, err := OpenPlaceResolver(path)
	if err != nil {
		t.Fatal(err)
	}
	match, ok := resolver.Nearest("SG", 1.3239, 103.79)
	if !ok {
		t.Fatal("expected nearest place")
	}
	if match.Name != "Holland Village" {
		t.Fatalf("nearest place = %q, want Holland Village", match.Name)
	}
	if match.FeatureCode != "PPLX" {
		t.Fatalf("feature code = %q, want PPLX", match.FeatureCode)
	}
	if match.DistanceKM <= 0 || match.DistanceKM > 3 {
		t.Fatalf("distance = %.3f, want within 3km", match.DistanceKM)
	}
}
