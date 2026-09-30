# Video Moment capture

Local Capture uses the existing Moment body and owned asset model. The normal
writing area accepts dropped videos and images without a separate upload panel.
Native desktop file drops and browser file drops queue the same File objects;
while Capture is open, the background document editor cannot consume its drops. The
Photos / videos action and Attach media slash command select MP4, WebM, MOV,
and M4V files; clipboard video files can also be queued. Capture previews use
object URLs that are revoked when the attachment changes or unmounts.

Moment capture presents the video before an editable title and optional rich-text body.
Capture retains the shared WYSIWYG Markdown editor, formatting toolbar, slash
commands and reference links for both Moments and articles.
The first decoded frame becomes its JPEG cover automatically; authors may upload
a cover or use the player’s current frame. Extraction runs locally and failures
keep saving disabled until a cover is selected.

Saving imports the file into the Moment's `assets/` directory and stores video with its cover using
`[![label](silan://resources/moment/.../assets/cover.jpg)](silan://resources/moment/.../assets/clip.mp4)`.
Both assets remain explicit Markdown references. Media precedes the optional caption.
Failed saves retain their draft and imported assets for retry without duplication.
The workspace scanner shares the media library’s supported extensions so videos
and covers both enter publication bundles.
No new Moment kind or metadata field is required. Desktop and public Markdown
renderers recognize video destinations and display native playback controls.
Container support does not imply transcoding: playback still depends on the
WebView/browser's support for the encoded video.

Desktop file imports use a binary IPC body, with document ID and JSON-escaped
filename headers, to avoid representing large videos as JSON number arrays.
The existing byte-array command remains a compatible public adapter. Both call
the same engine media-library use case.

The local `silan` media protocol resolves paths through MediaLibrary and responds
with the media MIME, byte-range and HEAD semantics. Single range responses are
bounded to 8 MiB; a seek reads only the requested portion. The public media
handler already uses HTTP ServeContent, and Moment detail already renders video
Markdown through its shared media node.

Regression coverage includes capture/import/save/sync persistence, all four
extensions' Markdown round trips and video rendering, Unicode filenames in
binary IPC headers, and local range/HEAD responses. Tests use fixture bytes for
storage/transport; they do not establish codec playback on every platform.
