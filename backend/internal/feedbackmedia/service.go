// Package feedbackmedia owns untrusted reader attachments, independently of authored media.
package feedbackmedia

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/google/uuid"
)

const ImageLimit int64 = 5 << 20
const VideoLimit int64 = 25 << 20

var ErrQuota = errors.New("daily upload limit reached (3 images and 1 video per IP, UTC)")
var ErrInvalid = errors.New("invalid media: JPEG/PNG up to 5 MB or MP4/WebM up to 25 MB and 120 seconds required")
var ErrScanner = errors.New("media safety scanner unavailable; upload rejected")
var ErrUnsafe = errors.New("media failed safety checks")

type Scanner interface {
	Scan(context.Context, string) error
}
type CommandScanner struct{}

func (CommandScanner) Scan(ctx context.Context, path string) error {
	err := exec.CommandContext(ctx, "clamscan", "--no-summary", "--", path).Run()
	if err == nil {
		return nil
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 1 {
		return ErrUnsafe
	}
	return ErrScanner
}

type Service struct {
	Root    string
	scanner Scanner
	now     func() time.Time
}

func New(root string) *Service { return &Service{Root: root, scanner: CommandScanner{}, now: time.Now} }

type Result struct {
	URL  string `json:"url"`
	Kind string `json:"kind"`
}

// Reserve before processing. Atomic mkdir makes quotas durable across processes and restarts.
// Failed validation releases the slot; interrupted processes conservatively retain it until UTC midnight.
func (s *Service) reserve(ip, kind string) (string, error) {
	hash := sha256.Sum256([]byte(ip))
	dir := filepath.Join(s.Root, "quota", s.now().UTC().Format("2006-01-02"), hex.EncodeToString(hash[:]), kind)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	count := 3
	if kind == "video" {
		count = 1
	}
	for i := 0; i < count; i++ {
		slot := filepath.Join(dir, strconv.Itoa(i))
		if err := os.Mkdir(slot, 0700); err == nil {
			return slot, nil
		} else if !os.IsExist(err) {
			return "", err
		}
	}
	return "", ErrQuota
}

// Lifecycle: reserved -> quarantined -> validated -> scanned -> published.
// Only published files are served. Every failure removes quarantine and releases quota.
func (s *Service) Upload(ctx context.Context, ip, kind string, src io.Reader) (Result, error) {
	if kind != "image" && kind != "video" {
		return Result{}, ErrInvalid
	}
	slot, err := s.reserve(ip, kind)
	if err != nil {
		return Result{}, err
	}
	published := false
	defer func() {
		if !published {
			_ = os.Remove(slot)
		}
	}()
	staging := filepath.Join(s.Root, "quarantine")
	if err = os.MkdirAll(staging, 0700); err != nil {
		return Result{}, err
	}
	f, err := os.CreateTemp(staging, "upload-")
	if err != nil {
		return Result{}, err
	}
	path := f.Name()
	defer os.Remove(path)
	limit := ImageLimit
	if kind == "video" {
		limit = VideoLimit
	}
	n, err := io.Copy(f, io.LimitReader(src, limit+1))
	closeErr := f.Close()
	if err != nil {
		return Result{}, err
	}
	if closeErr != nil {
		return Result{}, closeErr
	}
	if n == 0 || n > limit {
		return Result{}, ErrInvalid
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	if err = s.scanner.Scan(ctx, path); err != nil {
		return Result{}, err
	}
	clean := path + ".clean"
	defer os.Remove(clean)
	ext := ""
	if kind == "image" {
		ext, err = sanitizeImage(path, clean)
	} else {
		ext, err = sanitizeVideo(ctx, path, clean)
	}
	if err != nil {
		return Result{}, err
	}
	if err = s.scanner.Scan(ctx, clean); err != nil {
		return Result{}, err
	}
	dest := filepath.Join(s.Root, "published")
	if err = os.MkdirAll(dest, 0700); err != nil {
		return Result{}, err
	}
	name := uuid.NewString() + ext
	if err = os.Rename(clean, filepath.Join(dest, name)); err != nil {
		return Result{}, err
	}
	published = true
	return Result{URL: "/api/v1/feedback-media/" + name, Kind: kind}, nil
}
func sanitizeImage(path, out string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	cfg, format, err := image.DecodeConfig(f)
	if err != nil || (format != "jpeg" && format != "png") || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > 20_000_000 {
		return "", ErrInvalid
	}
	if _, err = f.Seek(0, 0); err != nil {
		return "", err
	}
	img, _, err := image.Decode(f)
	if err != nil {
		return "", ErrInvalid
	}
	dst, err := os.OpenFile(out, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", err
	}
	ext := ".png"
	if format == "jpeg" {
		ext = ".jpg"
		err = jpeg.Encode(dst, img, &jpeg.Options{Quality: 90})
	} else {
		err = png.Encode(dst, img)
	}
	closeErr := dst.Close()
	if err != nil {
		return "", err
	}
	if closeErr != nil {
		return "", closeErr
	}
	info, err := os.Stat(out)
	if err != nil {
		return "", err
	}
	if info.Size() > ImageLimit {
		return "", ErrInvalid
	}
	return ext, nil
}
func sanitizeVideo(ctx context.Context, path, out string) (string, error) {
	header := make([]byte, 12)
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	_, err = io.ReadFull(f, header)
	f.Close()
	if err != nil || !(bytes.Equal(header[4:8], []byte("ftyp")) || bytes.Equal(header[:4], []byte{0x1a, 0x45, 0xdf, 0xa3})) {
		return "", ErrInvalid
	}
	data, err := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=format_name,duration:stream=codec_type,width,height", "-of", "json", path).Output()
	if err != nil {
		return "", ErrInvalid
	}
	var probe struct {
		Format struct {
			Name     string `json:"format_name"`
			Duration string `json:"duration"`
		}
		Streams []struct {
			Type          string `json:"codec_type"`
			Width, Height int
		}
	}
	if json.Unmarshal(data, &probe) != nil {
		return "", ErrInvalid
	}
	duration, err := strconv.ParseFloat(probe.Format.Duration, 64)
	if err != nil || !(duration > 0 && duration <= 120) {
		return "", ErrInvalid
	}
	if probe.Format.Name != "mov,mp4,m4a,3gp,3g2,mj2" && probe.Format.Name != "matroska,webm" {
		return "", ErrInvalid
	}
	videos := 0
	for _, v := range probe.Streams {
		if v.Type == "video" {
			videos++
			if v.Width <= 0 || v.Height <= 0 || int64(v.Width)*int64(v.Height) > 3840*2160 {
				return "", ErrInvalid
			}
		} else if v.Type != "audio" {
			return "", ErrInvalid
		}
	}
	if videos != 1 {
		return "", ErrInvalid
	}
	// Full decode/re-encode rejects malformed bitstreams and strips metadata/attachments.
	err = exec.CommandContext(ctx, "ffmpeg", "-v", "error", "-xerror", "-nostdin", "-protocol_whitelist", "file", "-i", path, "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-c:v", "libx264", "-threads", "2", "-preset", "fast", "-crf", "28", "-c:a", "aac", "-t", "120", "-fs", fmt.Sprint(VideoLimit), "-movflags", "+faststart", "-f", "mp4", out).Run()
	if err != nil {
		return "", ErrInvalid
	}
	info, err := os.Stat(out)
	if err != nil {
		return "", err
	}
	if info.Size() >= VideoLimit {
		return "", ErrInvalid
	}
	return ".mp4", nil
}
