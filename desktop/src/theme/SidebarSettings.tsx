import { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeProvider';
import { sidebarColors, sidebarDimensions, MAX_SIDEBAR_IMAGE_BYTES, validateSidebarImage, type SidebarTarget } from './SidebarAppearance';
import { sidebarSurface } from './SidebarProjection';
import { Button } from '../components/ds/Button';

export function SidebarSettings() {
  const { session, state } = useTheme();
  const [target, setTarget] = useState<SidebarTarget>('editor');
  const [error, setError] = useState('');
  const request = useRef(0);
  const style = session.sidebarStyle(target);
  useEffect(() => { ++request.current; return () => { ++request.current; }; }, [target, state]);
  async function upload(file: File | undefined) {
    if (!file) return;
    const generation = ++request.current;
    setError('');
    try {
      if (file.size > MAX_SIDEBAR_IMAGE_BYTES) throw Error('Choose an image smaller than 1 MiB.');
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error('Could not read this image.'));
        reader.readAsDataURL(file);
      });
      validateSidebarImage(image);
      const decoded = new Image();
      decoded.src = image;
      await decoded.decode();
      if (generation === request.current) session.customizeSidebar(target, { ...style, image });
    } catch (cause) { if (generation === request.current) setError(String(cause)); }
  }
  return <section className="sidebar-settings" aria-label="Sidebar appearance">
    <h3>Sidebar appearance</h3>
    <p>Adjust each sidebar separately. Changes are saved on this device when you apply the theme.</p>
    <label>Sidebar <select value={target} onChange={event => { setTarget(event.target.value as SidebarTarget); setError(''); }}>
      <option value="editor">Editor · Files</option><option value="workspace">Workspace navigation</option>
    </select></label>
    <div className="sidebar-settings-columns">
      <div className="sidebar-settings-controls">
        <div className="sidebar-settings-colors">{Object.entries(sidebarColors).map(([key, label]) =>
          <label key={key}>{label}<input type="color" aria-label={label} value={style[key as keyof typeof sidebarColors]}
            onChange={event => session.customizeSidebar(target, { ...style, [key]: event.target.value })} /></label>)}</div>
        {Object.entries(sidebarDimensions).map(([key, range]) => <label className="sidebar-settings-range" key={key}>
          <span>{range.label}</span><input type="range" min={range.min} max={range.max} aria-label={range.label}
            value={style[key as keyof typeof sidebarDimensions]}
            onChange={event => session.customizeSidebar(target, { ...style, [key]: Number(event.target.value) })} />
          <output>{style[key as keyof typeof sidebarDimensions]}{key === 'imageOverlay' ? '%' : 'px'}</output>
        </label>)}
        <label>Background image <input type="file" accept="image/png,image/jpeg,image/webp"
          onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
        <small>PNG, JPEG or WebP · up to 1 MiB</small>
        {style.image && <div className="theme-settings-actions">
          <label>Fit <select value={style.imageFit} onChange={event => session.customizeSidebar(target, { ...style, imageFit: event.target.value as 'cover' | 'contain' })}>
            <option value="cover">Fill</option><option value="contain">Fit inside</option>
          </select></label>
          <label>Position <select value={style.imagePosition} onChange={event => session.customizeSidebar(target, { ...style, imagePosition: event.target.value as 'center' | 'top' | 'bottom' })}>
            <option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option>
          </select></label>
          <Button variant="ghost" onClick={() => { ++request.current; session.customizeSidebar(target, { ...style, image: null }); }}>Remove image</Button>
        </div>}
        <Button variant="secondary" onClick={() => { ++request.current; session.customizeSidebar(target, null); }}>Reset this sidebar</Button>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="sidebar-settings-preview" aria-label="Sidebar preview" style={{
        background: sidebarSurface(style), backgroundSize: style.imageFit, backgroundPosition: style.imagePosition,
        backgroundRepeat: 'no-repeat', color: style.foreground, border: `${style.borderWidth}px solid ${style.border}`, fontSize: style.fontSize,
      }}>
        <strong>{target === 'editor' ? 'FILES' : 'WORKSPACE'}</strong>
        <div style={{ background: style.selected, color: style.selectedForeground, borderRadius: style.radius, padding: style.padding }}> {target === 'editor' ? 'body' : 'Library'}</div>
        <div style={{ background: style.hover, borderRadius: style.radius, padding: style.padding }}>Hover preview</div>
        <small style={{ color: style.muted }}> {target === 'editor' ? 'READER REVIEW' : 'QUICK ACCESS'}</small>
        <div style={{ background: style.card, border: `${style.borderWidth}px solid ${style.border}`, borderRadius: style.radius, padding: style.padding }}>
          {target === 'editor' ? 'Current language' : 'Recent workspace'}<br /><small style={{ color: style.muted }}>Saved on this device</small>
        </div>
      </div>
    </div>
  </section>;
}
