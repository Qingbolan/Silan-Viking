package traffic

import (
	"bufio"
	"net"
	"net/netip"
	"os"
	"strconv"
	"strings"
)

type locationOverride struct {
	prefix            netip.Prefix
	location          GeoLocation
	countryCodeSet    bool
	regionCodeSet     bool
	regionNameSet     bool
	citySet           bool
	postalCodeSet     bool
	placeNameSet      bool
	placeFeatureSet   bool
	placeDistanceSet  bool
	coordinatesSet    bool
	timeZoneSet       bool
	accuracyRadiusSet bool
}

type LocationOverrideResolver struct {
	overrides []locationOverride
}

func OpenLocationOverrideResolver(path string) (*LocationOverrideResolver, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	resolver := &LocationOverrideResolver{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		override, ok := parseLocationOverride(scanner.Text())
		if ok {
			resolver.overrides = append(resolver.overrides, override)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return resolver, nil
}

func parseLocationOverride(line string) (locationOverride, bool) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return locationOverride{}, false
	}
	fields := strings.Split(line, "\t")
	if len(fields) < 13 {
		return locationOverride{}, false
	}
	prefix, ok := parseOverridePrefix(fields[0])
	if !ok {
		return locationOverride{}, false
	}
	latitude, latErr := strconv.ParseFloat(fields[9], 64)
	longitude, lonErr := strconv.ParseFloat(fields[10], 64)
	accuracyRadiusValue, accuracyRadiusSet := fieldValue(fields[12])
	accuracyRadius := 0
	var radiusErr error
	if accuracyRadiusSet && accuracyRadiusValue != "" {
		accuracyRadius, radiusErr = strconv.Atoi(accuracyRadiusValue)
	}
	if latErr != nil || lonErr != nil || radiusErr != nil {
		return locationOverride{}, false
	}
	distance, distanceSet := fieldValue(fields[8])
	placeDistance := 0.0
	if distanceSet && distance != "" {
		parsed, err := strconv.ParseFloat(fields[8], 64)
		if err != nil {
			return locationOverride{}, false
		}
		placeDistance = parsed
	}
	countryCode, countryCodeSet := fieldValue(fields[1])
	regionCode, regionCodeSet := fieldValue(fields[2])
	regionName, regionNameSet := fieldValue(fields[3])
	city, citySet := fieldValue(fields[4])
	postalCode, postalCodeSet := fieldValue(fields[5])
	placeName, placeNameSet := fieldValue(fields[6])
	placeFeature, placeFeatureSet := fieldValue(fields[7])
	timeZone, timeZoneSet := fieldValue(fields[11])
	return locationOverride{
		prefix:            prefix,
		countryCodeSet:    countryCodeSet,
		regionCodeSet:     regionCodeSet,
		regionNameSet:     regionNameSet,
		citySet:           citySet,
		postalCodeSet:     postalCodeSet,
		placeNameSet:      placeNameSet,
		placeFeatureSet:   placeFeatureSet,
		placeDistanceSet:  distanceSet,
		coordinatesSet:    true,
		timeZoneSet:       timeZoneSet,
		accuracyRadiusSet: accuracyRadiusSet,
		location: GeoLocation{
			CountryCode:    strings.ToUpper(countryCode),
			RegionCode:     regionCode,
			RegionName:     regionName,
			City:           city,
			PostalCode:     postalCode,
			PlaceName:      placeName,
			PlaceFeature:   placeFeature,
			PlaceDistance:  placeDistance,
			Latitude:       latitude,
			Longitude:      longitude,
			TimeZone:       timeZone,
			AccuracyRadius: accuracyRadius,
		},
	}, true
}

func parseOverridePrefix(value string) (netip.Prefix, bool) {
	value = strings.TrimSpace(value)
	if strings.Contains(value, "/") {
		prefix, err := netip.ParsePrefix(value)
		if err == nil {
			return prefix.Masked(), true
		}
		return netip.Prefix{}, false
	}
	ip := net.ParseIP(value)
	if ip == nil {
		return netip.Prefix{}, false
	}
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return netip.Prefix{}, false
	}
	addr = addr.Unmap()
	bits := 128
	if addr.Is4() {
		bits = 32
	}
	return netip.PrefixFrom(addr, bits), true
}

func (r *LocationOverrideResolver) Resolve(address string) (GeoLocation, bool) {
	override, ok := r.ResolveOverride(address)
	return override.location, ok
}

func (r *LocationOverrideResolver) ResolveOverride(address string) (locationOverride, bool) {
	if r == nil {
		return locationOverride{}, false
	}
	parsed := net.ParseIP(address)
	if parsed == nil {
		return locationOverride{}, false
	}
	addr, ok := netip.AddrFromSlice(parsed)
	if !ok {
		return locationOverride{}, false
	}
	addr = addr.Unmap()
	bestBits := -1
	var best locationOverride
	for _, override := range r.overrides {
		if override.prefix.Contains(addr) && override.prefix.Bits() > bestBits {
			bestBits = override.prefix.Bits()
			best = override
		}
	}
	if bestBits < 0 {
		return locationOverride{}, false
	}
	return best, true
}

func mergeLocationOverride(base GeoLocation, override locationOverride) GeoLocation {
	location := override.location
	if override.countryCodeSet {
		base.CountryCode = location.CountryCode
	}
	if override.regionCodeSet {
		base.RegionCode = location.RegionCode
	}
	if override.regionNameSet {
		base.RegionName = location.RegionName
	}
	if override.citySet {
		base.City = location.City
	}
	if override.postalCodeSet {
		base.PostalCode = location.PostalCode
	}
	if override.placeNameSet {
		base.PlaceName = location.PlaceName
	}
	if override.placeFeatureSet {
		base.PlaceFeature = location.PlaceFeature
	}
	if override.placeDistanceSet {
		base.PlaceDistance = location.PlaceDistance
	}
	if override.coordinatesSet {
		base.Latitude = location.Latitude
		base.Longitude = location.Longitude
	}
	if override.timeZoneSet {
		base.TimeZone = location.TimeZone
	}
	if override.accuracyRadiusSet {
		base.AccuracyRadius = location.AccuracyRadius
	}
	return base
}

func fieldValue(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false
	}
	if value == "-" {
		return "", true
	}
	return value, true
}
