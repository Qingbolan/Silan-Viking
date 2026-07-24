package traffic

import (
	"net"

	"github.com/oschwald/maxminddb-golang"
)

// GeoLocation is the most specific location the local MaxMind-compatible
// database can provide. It never calls an external IP lookup service.
type GeoLocation struct {
	CountryCode    string
	RegionCode     string
	RegionName     string
	City           string
	PostalCode     string
	PlaceName      string
	PlaceFeature   string
	PlaceDistance  float64
	Latitude       float64
	Longitude      float64
	TimeZone       string
	AccuracyRadius int
}

// CountryResolver maps an IP address to a local-database location.
type CountryResolver struct {
	database  *maxminddb.Reader
	places    *PlaceResolver
	overrides *LocationOverrideResolver
}

type countryRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
	City struct {
		Names map[string]string `maxminddb:"names"`
	} `maxminddb:"city"`
	Subdivisions []struct {
		ISOCode string            `maxminddb:"iso_code"`
		Names   map[string]string `maxminddb:"names"`
	} `maxminddb:"subdivisions"`
	Postal struct {
		Code string `maxminddb:"code"`
	} `maxminddb:"postal"`
	Location struct {
		AccuracyRadius uint16  `maxminddb:"accuracy_radius"`
		Latitude       float64 `maxminddb:"latitude"`
		Longitude      float64 `maxminddb:"longitude"`
		TimeZone       string  `maxminddb:"time_zone"`
	} `maxminddb:"location"`
}

func OpenCountryResolver(path string) (*CountryResolver, error) {
	database, err := maxminddb.Open(path)
	if err != nil {
		return nil, err
	}
	return &CountryResolver{database: database}, nil
}

func (r *CountryResolver) SetPlaceResolver(places *PlaceResolver) {
	if r != nil {
		r.places = places
	}
}

func (r *CountryResolver) SetLocationOverrideResolver(overrides *LocationOverrideResolver) {
	if r != nil {
		r.overrides = overrides
	}
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
	location := GeoLocation{
		CountryCode:    record.Country.ISOCode,
		City:           record.City.Names["en"],
		PostalCode:     record.Postal.Code,
		Latitude:       record.Location.Latitude,
		Longitude:      record.Location.Longitude,
		TimeZone:       record.Location.TimeZone,
		AccuracyRadius: int(record.Location.AccuracyRadius),
	}
	if len(record.Subdivisions) > 0 {
		// MaxMind stores subdivisions from broadest to most specific.
		subdivision := record.Subdivisions[len(record.Subdivisions)-1]
		location.RegionCode = subdivision.ISOCode
		location.RegionName = subdivision.Names["en"]
	}
	if r.places != nil && (location.Latitude != 0 || location.Longitude != 0) {
		if place, ok := r.places.Nearest(location.CountryCode, location.Latitude, location.Longitude); ok {
			location.PlaceName = place.Name
			location.PlaceFeature = place.FeatureCode
			location.PlaceDistance = place.DistanceKM
		}
	}
	if override, ok := r.overrides.ResolveOverride(address); ok {
		location = mergeLocationOverride(location, override)
	}
	return location
}
