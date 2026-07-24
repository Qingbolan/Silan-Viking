package traffic

import (
	"sync"
	"time"
)

// ObservationDeduplicator turns Nginx's internal-redirect mirrors into one
// crawler observation. Nginx keeps $request_id stable across those redirects,
// while independent requests always receive distinct IDs.
type ObservationDeduplicator struct {
	mu         sync.Mutex
	seen       map[string]time.Time
	ttl        time.Duration
	maxEntries int
}

func NewObservationDeduplicator(ttl time.Duration, maxEntries int) *ObservationDeduplicator {
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	if maxEntries <= 0 {
		maxEntries = 4096
	}
	return &ObservationDeduplicator{
		seen:       make(map[string]time.Time),
		ttl:        ttl,
		maxEntries: maxEntries,
	}
}

// Accept advances one request ID from unseen to observed. It returns false
// while that ID remains in the observed state and accepts it again after TTL.
func (d *ObservationDeduplicator) Accept(requestID string) bool {
	if d == nil || requestID == "" {
		return true
	}

	now := time.Now()
	d.mu.Lock()
	defer d.mu.Unlock()

	if observedAt, ok := d.seen[requestID]; ok && now.Sub(observedAt) < d.ttl {
		return false
	}
	d.seen[requestID] = now
	if len(d.seen) > d.maxEntries {
		d.removeExpiredOrOldest(now)
	}
	return true
}

func (d *ObservationDeduplicator) removeExpiredOrOldest(now time.Time) {
	var oldestID string
	var oldestAt time.Time
	for requestID, observedAt := range d.seen {
		if now.Sub(observedAt) >= d.ttl {
			delete(d.seen, requestID)
			continue
		}
		if oldestID == "" || observedAt.Before(oldestAt) {
			oldestID, oldestAt = requestID, observedAt
		}
	}
	if len(d.seen) > d.maxEntries && oldestID != "" {
		delete(d.seen, oldestID)
	}
}
