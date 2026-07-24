package traffic

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLocationOverrideResolverUsesMostSpecificPrefix(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "location-overrides.tsv")
	data := "" +
		"# cidr\tcountry\tregion_code\tregion_name\tcity\tpostal\tplace\tfeature\tdistance_km\tlat\tlon\ttime_zone\taccuracy_radius\n" +
		"14.100.52.0/24\tSG\t\t\tSingapore\t\tClementi\tSG_SUBZONE\t0\t1.315100\t103.765200\tAsia/Singapore\t1\n" +
		"14.100.52.173\tSG\t\t\tSingapore\t\tWest Coast\tSG_SUBZONE\t0\t1.316278\t103.755083\tAsia/Singapore\t1\n"
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		t.Fatalf("write override fixture: %v", err)
	}

	resolver, err := OpenLocationOverrideResolver(path)
	if err != nil {
		t.Fatalf("open override resolver: %v", err)
	}

	location, ok := resolver.Resolve("14.100.52.173")
	if !ok {
		t.Fatal("expected exact override match")
	}
	if location.PlaceName != "West Coast" {
		t.Fatalf("expected exact IP override to win, got %q", location.PlaceName)
	}
	if location.Latitude != 1.316278 || location.Longitude != 103.755083 {
		t.Fatalf("unexpected override coordinates: %f,%f", location.Latitude, location.Longitude)
	}

	location, ok = resolver.Resolve("14.100.52.99")
	if !ok {
		t.Fatal("expected CIDR override match")
	}
	if location.PlaceName != "Clementi" {
		t.Fatalf("expected CIDR override, got %q", location.PlaceName)
	}
}

func TestMergeLocationOverrideReplacesPlaceAndCoordinates(t *testing.T) {
	base := GeoLocation{
		CountryCode:   "SG",
		City:          "Singapore",
		PostalCode:    "27",
		PlaceName:     "Bukit Timah",
		PlaceFeature:  "PPL",
		PlaceDistance: 0.469,
		Latitude:      1.3239,
		Longitude:     103.79,
		TimeZone:      "Asia/Singapore",
	}
	override := locationOverride{
		postalCodeSet:     true,
		placeNameSet:      true,
		placeFeatureSet:   true,
		placeDistanceSet:  true,
		coordinatesSet:    true,
		accuracyRadiusSet: true,
		location: GeoLocation{
			PostalCode:     "",
			PlaceName:      "West Coast",
			PlaceFeature:   "SG_SUBZONE",
			PlaceDistance:  0,
			Latitude:       1.316278,
			Longitude:      103.755083,
			AccuracyRadius: 1,
		},
	}

	merged := mergeLocationOverride(base, override)
	if merged.PlaceName != "West Coast" || merged.PlaceFeature != "SG_SUBZONE" {
		t.Fatalf("override place not applied: %#v", merged)
	}
	if merged.Latitude != 1.316278 || merged.Longitude != 103.755083 {
		t.Fatalf("override coordinates not applied: %f,%f", merged.Latitude, merged.Longitude)
	}
	if merged.PostalCode != "" || merged.City != "Singapore" {
		t.Fatalf("explicit postal clear should preserve unrelated base fields: %#v", merged)
	}
}
