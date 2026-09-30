export type VideoCoverState =
  | { status: 'preparing' }
  | { status: 'ready'; file: File; source: 'frame' | 'upload'; time?: number }
  | { status: 'error'; message: string };

/** Decode a local frame; never upload the video to generate its poster. */
export async function extractVideoCover(file: File, time = 0, signal?: AbortSignal): Promise<File> {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        video.onloadeddata = null;
        video.onseeked = null;
        video.onerror = null;
      };
      const finish = () => { cleanup(); resolve(); };
      const fail = (message: string) => { cleanup(); reject(new Error(message)); };
      const abort = () => fail('Video cover cancelled');
      const timer = setTimeout(() => fail('Cannot decode this video. Choose a cover image.'), 15_000);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      video.onerror = () => fail('Cannot decode this video. Choose a cover image.');
      video.onloadeddata = () => {
        if (time <= 0) finish();
        else {
          video.onseeked = finish;
          video.currentTime = Math.min(time, Math.max(0, video.duration - 0.001));
        }
      };
      video.src = url;
      video.load();
    });
    const canvas = document.createElement('canvas');
    if (!video.videoWidth || !video.videoHeight) throw new Error('Video has no readable frame.');
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot create the video cover.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Cannot encode the video cover.')),
      'image/jpeg', 0.9,
    ));
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-cover.jpg`, { type: 'image/jpeg' });
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
