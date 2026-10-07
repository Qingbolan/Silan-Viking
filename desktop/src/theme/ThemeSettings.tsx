import { SidebarSettings } from './SidebarSettings';
import { useEffect, useState } from 'react';
import { useTheme } from './ThemeProvider';
import { Button } from '../components/ds/Button';
import { Input } from '../components/ds/Input';
import './theme-settings.css';

export function ThemeSettings() {
  const { session, state } = useTheme();
  const [uri, setUri] = useState('');
  useEffect(() => {
    void session.refresh();
    return () => session.cancel();
  }, [session]);
  return <section className="workspace-settings-section" aria-label="Appearance">
    <header className="workspace-settings-section-header">
      <h2>Appearance</h2>
      <p>Preview a theme across your workspace, then apply it to this device.</p>
    </header>
    <div className="theme-settings-list">
      {state.entries.map(entry => <button key={entry.uri} type="button"
        aria-pressed={state.displayedUri === entry.uri}
        onClick={() => void session.preview(entry.uri)}>
        <strong>{entry.name}</strong><small>{entry.uri}</small>
      </button>)}
    </div>
    <form className="theme-settings-address" onSubmit={event => { event.preventDefault(); void session.preview(uri.trim()); }}>
      <label htmlFor="theme-address">Theme address</label>
      <div>
        <Input id="theme-address" value={uri} onChange={event => setUri(event.target.value)} placeholder="silan://themes/my-theme" />
        <Button variant="secondary" type="submit" disabled={!uri.trim()}>Preview</Button>
      </div>
    </form>
    <SidebarSettings />
    <div className="theme-settings-actions">
      <Button disabled={state.phase !== 'previewing'} onClick={() => session.commit()}>Apply theme</Button>
      <Button variant="secondary" onClick={() => session.cancel()}>Cancel preview</Button>
      <Button variant="ghost" onClick={() => void session.refresh()}>Refresh themes</Button>
    </div>
    <p className="theme-settings-status" role="status">Applied: {state.appliedUri}{state.phase === 'previewing' ? ' · Preview is not saved' : ''}</p>
    {state.phase === 'loading' && <p role="status">Loading theme…</p>}
    {state.error && <p role="alert">{state.error}</p>}
  </section>;
}
