import React from 'react';
import { useLanguage } from '../LanguageContext';
import { mediaUrl } from '../../api/utils';
import type { MomentVideo } from '../../lib/momentMedia';

/** Feed previews play only while visible; the watch page owns interactive playback. */
export default function MomentVideoPlayer({ video, title, preview = false }: {
  video: MomentVideo; title: string; preview?: boolean;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const { language } = useLanguage();
  const [needsPlay, setNeedsPlay] = React.useState(false);
  React.useEffect(() => {
    const player = ref.current;
    if (!player) return;
    if (!preview) {
      let disposed = false;
      setNeedsPlay(false);
      player.muted = false;
      void player.play().catch(() => { if (!disposed) setNeedsPlay(true); });
      return () => { disposed = true; player.pause(); };
    }
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
  return <div className="relative">
    <video key={video.src} ref={ref}
    className={`aspect-video w-full rounded-ds-md bg-black object-contain ${preview ? 'pointer-events-none' : 'max-h-[75vh]'}`}
    src={mediaUrl(video.src)} poster={video.poster ? mediaUrl(video.poster) : undefined}
    autoPlay={!preview} muted={preview} playsInline loop={preview} controls={!preview}
    preload="metadata" aria-label={title} onPlaying={() => setNeedsPlay(false)}
  />
    {!preview && needsPlay && <button type="button"
      className="absolute inset-0 m-auto h-fit w-fit rounded-full bg-black/80 px-6 py-3 text-sm font-semibold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
      onClick={() => {
        if (!ref.current) return;
        ref.current.muted = false;
        void ref.current.play().catch(() => setNeedsPlay(true));
      }}>
      {language === 'zh' ? '播放并开启声音' : 'Play with sound'}
    </button>}
  </div>;
}
