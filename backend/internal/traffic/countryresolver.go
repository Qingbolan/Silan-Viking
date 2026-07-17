package traffic

import (
	"math"
	"net"

	"github.com/oschwald/maxminddb-golang"
)

// GeoLocation is intentionally coarse. Coordinates are rounded to one decimal
// place before leaving the resolver.
type GeoLocation struct {
	CountryCode string
	City        string
	Latitude    float64
	Longitude   float64
}

// CountryResolver maps an IP address to a coarse location using
// a local MaxMind-compatible database. Lookups never send visitor IPs to an
// external service.
type CountryResolver struct {
	database *maxminddb.Reader
}

type countryRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
	City struct {
		Names map[string]string `maxminddb:"names"`
	} `maxminddb:"city"`
	Location struct {
		Latitude  float64 `maxminddb:"latitude"`
		Longitude float64 `maxminddb:"longitude"`
	} `maxminddb:"location"`
}

func OpenCountryResolver(path string) (*CountryResolver, error) {
	database, err := maxminddb.Open(path)
	if err != nil {
		return nil, err
	}
	return &CountryResolver{database: database}, nil
}

func (r *CountryResolver) Resolve(address string) GeoLocation {
	if r == nil || r.database == nil {
		return GeoLocation{}
	}
	ip := net.ParseIP(address)
	if ip == nil || ip.IsPrivate() || ip.IsLoopback() {
		return GeoLocation{}
	}
	var record countryRecord
	if err := r.database.Lookup(ip, &record); err != nil {
		return GeoLocation{}
	}
	return GeoLocation{
		CountryCode: record.Country.ISOCode,
		City:        record.City.Names["en"],
		Latitude:    math.Round(record.Location.Latitude*10) / 10,
		Longitude:   math.Round(record.Location.Longitude*10) / 10,
	}
}
