import { useMediaText } from './MediaMessages';
import { ResolvedMediaImage } from './MediaEnvironment';
import React from 'react';
import { createPortal } from 'react-dom';

export function MediaViewer({ images, initial, onClose }: { images: { src: string; alt: string }[]; initial: number; onClose: () => void }) {
  const t = useMediaText();
  const [index, setIndex] = React.useState(initial);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const stage = React.useRef<HTMLDivElement>(null);
  const root = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [index]);
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    const wheel = (event: WheelEvent) => { event.preventDefault(); setZoom(value => Math.max(.1, Math.min(12, value * Math.exp(-event.deltaY * .002)))); };
    const element = stage.current;
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => { element?.removeEventListener('wheel', wheel); document.body.style.overflow = overflow; before?.focus(); };
  }, []);
  const navigate = (direction: number) => setIndex((current) => (current + direction + images.length) % images.length);
  return createPortal(<div className="media-viewer" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('图片查看器')}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') navigate(-1);
      if (event.key === 'ArrowRight') navigate(1);
      if (event.key === 'Tab') {
        const controls = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button') || []);
        const current = controls.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault(); controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
    }}>
    <div className="media-viewer-controls"><button onClick={onClose}>{t('关闭 Esc')}</button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{t('重置')}</button><span>{Math.round(zoom * 100)}% · {index + 1}/{images.length}</span></div>
    <button className="media-viewer-prev" onClick={() => navigate(-1)} aria-label={t('上一张')}>‹</button>
    <div className="media-viewer-stage" ref={stage}
      onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }; }}
      onPointerMove={(event) => { const start = drag.current; if (start) setPan({ x: start.px + event.clientX - start.x, y: start.py + event.clientY - start.y }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <ResolvedMediaImage src={images[index].src} alt={images[index].alt} draggable={false} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />
    </div>
    <button className="media-viewer-next" onClick={() => navigate(1)} aria-label={t('下一张')}>›</button>
    <p>{images[index].alt}</p>
  </div>, document.body);
}
