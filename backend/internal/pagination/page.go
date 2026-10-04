// Package pagination owns overflow-safe page arithmetic, not endpoint policy.
package pagination

// Page is a normalized request. A zero maxSize preserves an uncapped API.
type Page struct{ Number, Size int }

func New(number, size, maxSize int) Page {
	if number < 1 {
		number = 1
	}
	if size < 1 {
		size = 10
	}
	if maxSize > 0 && size > maxSize {
		size = maxSize
	}
	return Page{Number: number, Size: size}
}

// Offset returns false for empty/out-of-range pages without multiplying an
// untrusted page number. Callers can skip the row query in that case.
func (p Page) Offset(total int) (int, bool) {
	if p.Number < 1 || p.Size < 1 || total <= 0 || p.Number-1 > (total-1)/p.Size {
		return 0, false
	}
	return (p.Number - 1) * p.Size, true
}
func (p Page) TotalPages(total int) int {
	if total <= 0 || p.Size < 1 {
		return 0
	}
	result := total / p.Size
	if total%p.Size != 0 {
		result++
	}
	return result
}
