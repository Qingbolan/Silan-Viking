package traffic

import (
	"bufio"
	"math"
	"os"
	"strconv"
	"strings"
)

type PlaceMatch struct {
	Name        string
	FeatureCode string
	DistanceKM  float64
}

type placeRecord struct {
	name        string
	featureCode string
	countryCode string
	latitude    float64
	longitude   float64
}

// PlaceResolver is an offline nearest-place index over a GeoNames dump.
type PlaceResolver struct {
	byCountry map[string][]placeRecord
	all       []placeRecord
}

func OpenPlaceResolver(path string) (*PlaceResolver, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	resolver := &PlaceResolver{byCountry: make(map[string][]placeRecord)}
	scanner := bufio.NewScanner(file)
	buffer := make([]byte, 0, 256*1024)
	scanner.Buffer(buffer, 1024*1024)
	for scanner.Scan() {
		record, ok := parseGeoNamesRecord(scanner.Text())
		if !ok {
			continue
		}
		resolver.all = append(resolver.all, record)
		resolver.byCountry[record.countryCode] = append(resolver.byCountry[record.countryCode], record)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return resolver, nil
}

func parseGeoNamesRecord(line string) (placeRecord, bool) {
	fields := strings.Split(line, "\t")
	if len(fields) < 18 {
		return placeRecord{}, false
	}
	latitude, latErr := strconv.ParseFloat(fields[4], 64)
	longitude, lonErr := strconv.ParseFloat(fields[5], 64)
	if latErr != nil || lonErr != nil {
		return placeRecord{}, false
	}
	name := fields[1]
	if ascii := fields[2]; ascii != "" {
		name = ascii
	}
	countryCode := strings.ToUpper(strings.TrimSpace(fields[8]))
	if name == "" || countryCode == "" {
		return placeRecord{}, false
	}
	return placeRecord{
		name:        name,
		featureCode: fields[7],
		countryCode: countryCode,
		latitude:    latitude,
		longitude:   longitude,
	}, true
}

func (r *PlaceResolver) Nearest(countryCode string, latitude, longitude float64) (PlaceMatch, bool) {
	if r == nil {
		return PlaceMatch{}, false
	}
	candidates := r.byCountry[strings.ToUpper(strings.TrimSpace(countryCode))]
	if len(candidates) == 0 {
		candidates = r.all
	}
	if len(candidates) == 0 {
		return PlaceMatch{}, false
	}
	bestDistance := math.Inf(1)
	var best placeRecord
	for _, candidate := range candidates {
		distance := haversineKM(latitude, longitude, candidate.latitude, candidate.longitude)
		if distance < bestDistance {
			best = candidate
			bestDistance = distance
		}
	}
	return PlaceMatch{
		Name:        best.name,
		FeatureCode: best.featureCode,
		DistanceKM:  bestDistance,
	}, true
}

func haversineKM(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKM = 6371.0088
	rad := func(degrees float64) float64 { return degrees * math.Pi / 180 }
	dLat := rad(lat2 - lat1)
	dLon := rad(lon2 - lon1)
	lat1Rad := rad(lat1)
	lat2Rad := rad(lat2)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return earthRadiusKM * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
