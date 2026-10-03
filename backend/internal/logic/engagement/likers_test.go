package engagement

import (
	"context"
	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/traffic"
	"testing"
)

type testCountries struct{}

func (testCountries) Resolve(ip string) traffic.GeoLocation {
	if ip == "203.0.113.1" {
		return traffic.GeoLocation{CountryCode: "sg"}
	}
	return traffic.GeoLocation{}
}
func TestProjectLikerCountry(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:project-liker-country?mode=memory&cache=shared&_fk=1")
	defer client.Close()
	client.ProjectLike.Create().SetProjectID("p").SetFingerprint("guest").SetIPAddress("203.0.113.1").SaveX(ctx)
	rows, err := ProjectLikers(ctx, client, "p", 24, testCountries{})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].CountryCode != "SG" || rows[0].VisitorNumber == "" {
		t.Fatalf("missing visitor flag identity: %+v", rows)
	}
}
