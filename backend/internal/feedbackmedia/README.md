# Feedback attachments

These are reader-owned runtime data, not authored content resources. POST
`/api/v1/feedback-media?kind=image|video` accepts a multipart request whose first
part is `file`. The response is `{url,kind}`. GET uses the returned URL, supports
video ranges, and never serves quarantine or quota files.

Limits are shared across projects, persisted across restarts, and reserved
atomically across backend processes sharing the same filesystem:

- Images: 3 successful uploads per IP per UTC day; JPEG/PNG, 5 MiB each,
  at most 20 million decoded pixels. Metadata is removed by re-encoding.
- Video: 1 per IP per UTC day; MP4/WebM input, 25 MiB, 120 seconds, at most
  3840×2160 pixels. Full decode/re-encode produces MP4 without metadata.
- IPv6 addresses share a /64 quota. Forwarded headers are trusted only from
  loopback peers; walk the chain right-to-left, never trust the first header.
  Non-loopback proxies deliberately share their peer IP quota until an explicit
  trusted-proxy policy is configured. Do not expose the loopback proxy listener
  to an untrusted forwarding service.
- Two processing jobs per backend process. Each job has a 90-second deadline.

Lifecycle: reserve -> quarantine -> scan -> validate/re-encode -> scan -> publish.
Failures remove files and release the quota reservation. A process crash may
retain a reservation until the next UTC day. Successful, unattached uploads still
count. File names are server-generated UUIDs; only published allowlisted names
are accessible. No user filename or media URL becomes a shell command argument.

## Runtime setup

Set `FEEDBACK_MEDIA_ROOT` to a persistent backend-writable directory (default
`/var/lib/silan-viking/feedback-media`). Keep it out of authored-media promotion
and out of direct Nginx static serving. Multiple hosts require a shared atomic
filesystem; separate local volumes would each grant their own quota.

Install `clamav`, `clamav-freshclam`, and `ffmpeg` on the backend host. Initialize
and keep the ClamAV signature database updated with the distro freshclam service.
The backend service account must be able to execute `clamscan`, `ffprobe`, and
`ffmpeg`, read the ClamAV database, and write the storage directory. Container
installations must provision the same binaries/database and a persistent mount.
Scanner failure (including missing binary/database) returns 503 and never bypasses
scanning. The API checks malware and media integrity, not semantic content
moderation. Keep media decoders and antivirus packages patched.

Back up `published` and `quota` together. Old UTC-day quota directories and stale
quarantine files can be removed during maintenance with the backend stopped.
Published files are retained because feedback references must remain valid.
