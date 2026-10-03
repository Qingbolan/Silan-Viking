package feedbackmedia

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type scannerStub struct{ err error }

func (s scannerStub) Scan(context.Context, string) error { return s.err }
func picture() []byte {
	var b bytes.Buffer
	_ = png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	return b.Bytes()
}
func TestQuotaConcurrentAndPersistent(t *testing.T) {
	root := t.TempDir()
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s := New(root)
			s.scanner = scannerStub{}
			_, err := s.Upload(context.Background(), "203.0.113.1", "image", bytes.NewReader(picture()))
			if err == nil {
				accepted.Add(1)
			} else if !errors.Is(err, ErrQuota) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if accepted.Load() != 3 {
		t.Fatalf("accepted %d", accepted.Load())
	}
	s := New(root)
	s.scanner = scannerStub{}
	if _, err := s.Upload(context.Background(), "203.0.113.1", "image", bytes.NewReader(picture())); !errors.Is(err, ErrQuota) {
		t.Fatal(err)
	}
	s.now = func() time.Time { return time.Now().Add(24 * time.Hour) }
	if _, err := s.Upload(context.Background(), "203.0.113.1", "image", bytes.NewReader(picture())); err != nil {
		t.Fatal(err)
	}
}
func TestRejectedUploadsNeverPublishedOrCharged(t *testing.T) {
	s := New(t.TempDir())
	s.scanner = scannerStub{ErrScanner}
	if _, err := s.Upload(context.Background(), "ip", "image", bytes.NewReader(picture())); !errors.Is(err, ErrScanner) {
		t.Fatal(err)
	}
	s.scanner = scannerStub{}
	for _, data := range [][]byte{[]byte("<svg><script>alert(1)</script></svg>"), make([]byte, ImageLimit+1)} {
		if _, err := s.Upload(context.Background(), "ip", "image", bytes.NewReader(data)); !errors.Is(err, ErrInvalid) {
			t.Fatal(err)
		}
	}
	if _, err := s.Upload(context.Background(), "ip", "video", strings.NewReader("#EXTM3U\n/etc/passwd")); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	if entries, _ := os.ReadDir(s.Root + "/published"); len(entries) != 0 {
		t.Fatal("published rejected file")
	}
	for i := 0; i < 3; i++ {
		if _, err := s.Upload(context.Background(), "ip", "image", bytes.NewReader(picture())); err != nil {
			t.Fatal(err)
		}
	}
}
func TestIPTrustAndTraversal(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "203.0.113.9:90"
	r.Header.Set("X-Forwarded-For", "1.1.1.1")
	if clientIP(r) != "203.0.113.9" {
		t.Fatal(clientIP(r))
	}
	r.RemoteAddr = "127.0.0.1:90"
	r.Header.Set("X-Forwarded-For", "1.1.1.1, 203.0.113.9")
	if clientIP(r) != "203.0.113.9" {
		t.Fatal(clientIP(r))
	}
	s := New(t.TempDir())
	w := httptest.NewRecorder()
	r = httptest.NewRequest("GET", "/api/v1/feedback-media/../quota", nil)
	s.GetHandler()(w, r)
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
}

func TestHTTPQuotaAndServing(t *testing.T) {
	s := New(t.TempDir())
	s.scanner = scannerStub{}
	result, err := s.Upload(context.Background(), "ip", "image", bytes.NewReader(picture()))
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.GetHandler()(w, httptest.NewRequest("GET", result.URL, nil))
	if w.Code != 200 || w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal(w.Code, w.Header())
	}
	if _, _, err = image.Decode(bytes.NewReader(w.Body.Bytes())); err != nil {
		t.Fatal(err)
	}
}

func TestVideoPipeline(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not installed")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("ffprobe not installed")
	}
	path := filepath.Join(t.TempDir(), "sample.mp4")
	if err := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:d=0.2", "-c:v", "libx264", path).Run(); err != nil {
		t.Fatal(err)
	}
	s := New(t.TempDir())
	s.scanner = scannerStub{}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	result, err := s.Upload(context.Background(), "ip", "video", f)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.URL, ".mp4") {
		t.Fatal(result)
	}
	if _, err = s.Upload(context.Background(), "ip", "video", bytes.NewReader(nil)); !errors.Is(err, ErrQuota) {
		t.Fatal(err)
	}
}
