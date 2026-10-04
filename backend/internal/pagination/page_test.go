package pagination

import "testing"

func TestPageBoundariesAndOverflow(t *testing.T) {
	maxInt := int(^uint(0) >> 1)
	for _, tc := range []struct {
		number, size, total, offset, pages int
		valid                              bool
	}{
		{1, 10, 0, 0, 0, false}, {1, 10, 11, 0, 2, true}, {2, 10, 11, 10, 2, true},
		{3, 10, 11, 0, 2, false}, {maxInt, 10, 100, 0, 10, false},
		{maxInt, 1, maxInt, maxInt - 1, maxInt, true}, {1, maxInt, maxInt, 0, 1, true},
	} {
		p := New(tc.number, tc.size, 0)
		offset, valid := p.Offset(tc.total)
		if offset != tc.offset || valid != tc.valid || p.TotalPages(tc.total) != tc.pages {
			t.Fatalf("%+v: offset=%d valid=%v pages=%d", tc, offset, valid, p.TotalPages(tc.total))
		}
	}
	if got := New(-1, 0, 0); got.Number != 1 || got.Size != 10 {
		t.Fatal(got)
	}
	if got := New(1, maxInt, 50); got.Size != 50 {
		t.Fatal(got)
	}
}

func TestEverySmallPageCoversExactlyItsRows(t *testing.T) {
	for total := 0; total < 100; total++ {
		for size := 1; size <= 20; size++ {
			visited := 0
			for number := 1; number <= total+2; number++ {
				page := New(number, size, 0)
				offset, ok := page.Offset(total)
				if !ok {
					continue
				}
				if offset != visited {
					t.Fatalf("gap or overlap: total=%d size=%d page=%d offset=%d visited=%d", total, size, number, offset, visited)
				}
				visited += min(size, total-offset)
			}
			if visited != total {
				t.Fatalf("visited %d of %d", visited, total)
			}
		}
	}
}
