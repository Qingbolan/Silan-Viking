import { useEffect, useRef, useState } from 'react';
import { toWebviewMediaUrl } from '../../lib/media';

const PREVIEW_WIDTH = 1280;

const titleInitial = (title: string) => {
  const trimmed = title.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
};

export function ProjectPlaceholder({ title }: { title: string }) {
  return (
    <span className="project-preview-surface project-preview-placeholder" aria-hidden="true">
      <span>{titleInitial(title)}</span>
    </span>
  );
}

export function ProjectLivePreview({
  url,
  fallbackTitle,
}: {
  url: string;
  fallbackTitle: string;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(0.3);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const measure = () => setScale(wrapper.clientWidth / PREVIEW_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [url]);

  useEffect(() => {
    if (loaded || failed) return undefined;
    const timeout = window.setTimeout(() => setFailed(true), 6000);
    return () => window.clearTimeout(timeout);
  }, [failed, loaded, url]);

  if (failed) return <ProjectPlaceholder title={fallbackTitle} />;

  const virtualHeight = wrapperRef.current && scale > 0
    ? wrapperRef.current.clientHeight / scale
    : 800;

  return (
    <span ref={wrapperRef} className="project-preview-surface project-preview-live">
      <iframe
        src={url}
        title={`${fallbackTitle} website preview`}
        loading="lazy"
        tabIndex={-1}
        scrolling="no"
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{
          width: PREVIEW_WIDTH,
          height: virtualHeight,
          transform: `scale(${scale})`,
        }}
      />
      <span className="project-preview-wash" aria-hidden="true" />
    </span>
  );
}

export function ProjectPreviewSurface({
  title,
  imageUrl,
  websiteUrl,
}: {
  title: string;
  imageUrl?: string;
  websiteUrl?: string;
}) {
  const resolvedImageUrl = toWebviewMediaUrl(imageUrl);

  if (resolvedImageUrl) {
    return (
      <span className="project-preview-surface">
        <img src={resolvedImageUrl} alt="" loading="lazy" />
      </span>
    );
  }
  if (websiteUrl) {
    return <ProjectLivePreview url={websiteUrl} fallbackTitle={title} />;
  }
  return <ProjectPlaceholder title={title} />;
}
