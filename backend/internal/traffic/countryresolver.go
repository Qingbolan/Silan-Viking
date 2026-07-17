package traffic

import (
	"net"

	"github.com/oschwald/maxminddb-golang"
)

// CountryResolver maps an IP address to an ISO 3166-1 alpha-2 country using
// a local MaxMind-compatible database. Lookups never send visitor IPs to an
// external service.
type CountryResolver struct {
	database *maxminddb.Reader
}

type countryRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
}

func OpenCountryResolver(path string) (*CountryResolver, error) {
	database, err := maxminddb.Open(path)
	if err != nil {
		return nil, err
	}
	return &CountryResolver{database: database}, nil
}

func (r *CountryResolver) Resolve(address string) string {
	if r == nil || r.database == nil {
		return ""
	}
	ip := net.ParseIP(address)
	if ip == nil || ip.IsPrivate() || ip.IsLoopback() {
		return ""
	}
	var record countryRecord
	if err := r.database.Lookup(ip, &record); err != nil {
		return ""
	}
	return record.Country.ISOCode
}
