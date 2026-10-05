import React from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { FolderOpen } from 'lucide-react';

type WorkspaceSwitcherEntry = {
  project_root: string;
  project_name: string;
  last_opened_at: number;
  available: boolean;
};

type WorkspaceSwitcherState = {
  current: WorkspaceSwitcherEntry | null;
  recent: WorkspaceSwitcherEntry[];
  replaced: WorkspaceSwitcherEntry | null;
};

const NOTICE_DISMISSED_KEY = 'sv-workspace-switch-notice-dismissed';

/** Reads the device workspace registry and activates a recent workspace. */
function useWorkspaceSwitcher() {
  const [state, setState] = React.useState<WorkspaceSwitcherState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [switching, setSwitching] = React.useState(false);

  React.useEffect(() => {
    if (!isTauri()) return;
    invoke<WorkspaceSwitcherState>('get_workspace_switcher')
      .then(setState)
      .catch((reason) => setError(String(reason)));
  }, []);

  const switchTo = async (projectRoot: string) => {
    if (switching) return;
    setSwitching(true);
    setError(null);
    try {
      await invoke<WorkspaceSwitcherState>('switch_workspace', { projectRoot });
      // Every view is rebuilt from the newly active project.
      window.location.reload();
    } catch (reason) {
      setError(String(reason));
      setSwitching(false);
    }
  };

  return { state, error, switching, switchTo };
}

/** Sidebar control: current workspace name plus a recent-workspaces list. */
export function WorkspaceSwitcher() {
  const { state, error, switching, switchTo } = useWorkspaceSwitcher();
  if (!state?.current && !state?.recent.length) return null;
  return (
    <div className="workspace-switcher">
      <label>
        <span><FolderOpen size={12} aria-hidden="true" /> Workspace</span>
        <select
          aria-label="Switch workspace"
          value={state.current?.project_root || ''}
          disabled={switching || state.recent.length === 0}
          title={state.current?.project_root}
          onChange={(event) => {
            if (event.target.value !== state.current?.project_root) void switchTo(event.target.value);
          }}
        >
          {state.current && (
            <option value={state.current.project_root}>{state.current.project_name}</option>
          )}
          {state.recent.map((workspace) => (
            <option key={workspace.project_root} value={workspace.project_root} disabled={!workspace.available}>
              {workspace.project_name} · {workspace.project_root}{workspace.available ? '' : ' (missing)'}
            </option>
          ))}
        </select>
      </label>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

/** Shown once per launch when this launch opened a different workspace than last time. */
export function WorkspaceSwitchNotice() {
  const { state, switching, switchTo } = useWorkspaceSwitcher();
  const replaced = state?.replaced;
  const [dismissed, setDismissed] = React.useState(() => {
    try { return window.sessionStorage.getItem(NOTICE_DISMISSED_KEY) === replaced?.project_root; } catch { return false; }
  });
  if (!replaced || !state?.current || dismissed) return null;
  const dismiss = () => {
    try { window.sessionStorage.setItem(NOTICE_DISMISSED_KEY, replaced.project_root); } catch { /* per-viewer convenience */ }
    setDismissed(true);
  };
  return (
    <div className="workspace-switch-notice" role="status">
      <span>
        Opened <strong>{state.current.project_name}</strong>. Last time you used{' '}
        <strong>{replaced.project_name}</strong> ({replaced.project_root}).
      </span>
      <button type="button" disabled={switching} onClick={() => void switchTo(replaced.project_root)}>
        Switch back
      </button>
      <button type="button" onClick={dismiss}>Dismiss</button>
    </div>
  );
}
