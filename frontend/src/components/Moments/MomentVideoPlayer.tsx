import React from 'react';
import { mediaUrl } from '../../api/utils';
import type { MomentVideo } from '../../lib/momentMedia';

/** Feed previews play only while visible; the watch page owns interactive playback. */
export default function MomentVideoPlayer({ video, title, preview = false }: {
  video: MomentVideo; title: string; preview?: boolean;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const player = ref.current;
    if (!player || !preview) return;
    let visible = false;
    const sync = () => {
      if (visible && !document.hidden) void player.play().catch(() => {});
      else player.pause();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= 0.25; sync(); }, { threshold: 0.25 });
    observer.observe(player);
    document.addEventListener('visibilitychange', sync);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); player.pause(); };
  }, [preview, video.src]);
  return <video key={video.src} ref={ref}
    className={`aspect-video w-full rounded-ds-md bg-black object-contain ${preview ? 'pointer-events-none' : 'max-h-[75vh]'}`}
    src={mediaUrl(video.src)} poster={video.poster ? mediaUrl(video.poster) : undefined}
    autoPlay={!preview} muted playsInline loop={preview} controls={!preview}
    preload="metadata" aria-label={title}
  />;
}
