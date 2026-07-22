import React from 'react';

const PREVIEW_W = 1280;

const titleInitial = (title: string): string => {
  const trimmed = title.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
};

export const ProjectPlaceholder: React.FC<{ title: string }> = ({ title }) => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(110% 110% at 16% 10%, color-mix(in oklch, var(--ds-color-primary) 16%, transparent), transparent 60%), ' +
          'radial-gradient(110% 110% at 86% 94%, color-mix(in oklch, var(--ds-color-accent) 13%, transparent), transparent 58%), ' +
          'var(--ds-color-surface-2)',
      }}
    />
    <span className="relative select-none font-display text-5xl font-semibold text-ds-fg-subtle/60">
      {titleInitial(title)}
    </span>
  </div>
);

interface ProjectLivePreviewProps {
  url: string;
  title?: string;
  fallbackTitle: string;
}

export const ProjectLivePreview: React.FC<ProjectLivePreviewProps> = ({
  url,
  title = 'Live demo preview',
  fallbackTitle,
}) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.3);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / PREVIEW_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    setLoaded(false);
    setFailed(false);
    const id = window.setTimeout(() => {
      setFailed((current) => current || !loaded);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [loaded, url]);

  const virtualH = wrapRef.current
    ? wrapRef.current.clientHeight / scale
    : 800;

  if (failed) return <ProjectPlaceholder title={fallbackTitle} />;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-ds-surface-2">
      <iframe
        src={url}
        title={title}
        loading="lazy"
        tabIndex={-1}
        scrolling="no"
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className="pointer-events-none origin-top-left border-0"
        style={{
          width: PREVIEW_W,
          height: virtualH,
          transform: `scale(${scale})`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/10" />
    </div>
  );
};
