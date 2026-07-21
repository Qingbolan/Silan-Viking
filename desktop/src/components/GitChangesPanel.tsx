import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Check, LoaderCircle, X } from 'lucide-react';
import type { WorkspaceFileChange } from '../types';

type GitChangesPanelProps = {
  onClose: () => void;
  onCommitted: () => void;
};

const STATUS_ORDER = ['Modified', 'Added', 'Deleted', 'Renamed', 'Copied', 'Untracked'];

function DiffView({ diff }: { diff: string }) {
  if (!diff.trim()) {
    return <p className="git-diff-empty">No changes to show.</p>;
  }
  return (
    <pre className="git-diff-view">
      {diff.split('\n').map((line, index) => {
        let tone: 'add' | 'remove' | 'hunk' | undefined;
        if (line.startsWith('+++') || line.startsWith('---')) tone = undefined;
        else if (line.startsWith('+')) tone = 'add';
        else if (line.startsWith('-')) tone = 'remove';
        else if (line.startsWith('@@')) tone = 'hunk';
        return (
          <span key={index} className="git-diff-line" data-tone={tone}>
            {line}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}

export function GitChangesPanel({ onClose, onCommitted }: GitChangesPanelProps) {
  const [changes, setChanges] = React.useState<WorkspaceFileChange[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [diff, setDiff] = React.useState('');
  const [diffLoading, setDiffLoading] = React.useState(false);
  const [diffError, setDiffError] = React.useState<string | null>(null);
  const [togglingPath, setTogglingPath] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState('');
  const [committing, setCommitting] = React.useState(false);
  const [commitError, setCommitError] = React.useState<string | null>(null);

  const loadChanges = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<WorkspaceFileChange[]>('get_workspace_changes');
      setChanges(result);
      setSelectedPath((current) => {
        if (current && result.some((change) => change.path === current)) return current;
        return result[0]?.path ?? null;
      });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  const selected = changes.find((change) => change.path === selectedPath) || null;

  React.useEffect(() => {
    if (!selected) {
      setDiff('');
      return;
    }
    let active = true;
    setDiffLoading(true);
    setDiffError(null);
    invoke<string>('get_workspace_file_diff', { path: selected.path, staged: selected.staged })
      .then((result) => { if (active) setDiff(result); })
      .catch((reason) => { if (active) setDiffError(String(reason)); })
      .finally(() => { if (active) setDiffLoading(false); });
    return () => { active = false; };
  }, [selected?.path, selected?.staged]);

  const stagedPaths = changes.filter((change) => change.staged).map((change) => change.path);
  const allStaged = changes.length > 0 && stagedPaths.length === changes.length;

  const toggleStaged = async (change: WorkspaceFileChange) => {
    if (togglingPath) return;
    setTogglingPath(change.path);
    try {
      if (change.staged) {
        await invoke('unstage_workspace_paths', { paths: [change.path] });
      } else {
        await invoke('stage_workspace_paths', { paths: [change.path] });
      }
      await loadChanges();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setTogglingPath(null);
    }
  };

  const toggleAll = async () => {
    if (togglingPath || changes.length === 0) return;
    setTogglingPath('*');
    try {
      const paths = changes.map((change) => change.path);
      if (allStaged) {
        await invoke('unstage_workspace_paths', { paths });
      } else {
        await invoke('stage_workspace_paths', { paths });
      }
      await loadChanges();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setTogglingPath(null);
    }
  };

  const commit = async () => {
    if (committing || stagedPaths.length === 0 || !message.trim()) return;
    setCommitting(true);
    setCommitError(null);
    try {
      await invoke('commit_workspace_changes', { message: message.trim() });
      setMessage('');
      onCommitted();
      await loadChanges();
    } catch (reason) {
      setCommitError(String(reason));
    } finally {
      setCommitting(false);
    }
  };

  const sortedChanges = [...changes].sort((left, right) => {
    const order = STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status);
    return order !== 0 ? order : left.path.localeCompare(right.path);
  });

  return (
    <section className="resume-editor-workspace git-panel-workspace" role="dialog" aria-modal="true" aria-labelledby="git-panel-title">
      <header className="resume-editor-topbar">
        <div className="resume-editor-title">
          <span>Content repository</span>
          <strong id="git-panel-title">Uncommitted changes</strong>
          <em>{changes.length} file{changes.length === 1 ? '' : 's'} changed</em>
        </div>
        <button type="button" className="git-panel-close" onClick={onClose} aria-label="Close changes panel" title="Close">
          <X size={15} />
        </button>
      </header>

      <div className="resume-editor-body git-panel-body">
        <aside className="git-panel-file-list" aria-label="Changed files">
          <label className="git-panel-select-all">
            <input
              type="checkbox"
              checked={allStaged}
              disabled={loading || changes.length === 0 || togglingPath !== null}
              onChange={() => void toggleAll()}
            />
            <span>{stagedPaths.length} of {changes.length} staged</span>
          </label>

          {loading && (
            <div className="git-panel-loading">
              <LoaderCircle size={15} className="spin" />
              <span>Reading workspace status...</span>
            </div>
          )}

          {error && (
            <div className="git-panel-error" role="alert">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && changes.length === 0 && (
            <p className="git-panel-empty">No uncommitted changes.</p>
          )}

          <ul className="git-panel-files">
            {sortedChanges.map((change) => (
              <li key={change.path} data-selected={change.path === selectedPath}>
                <input
                  type="checkbox"
                  checked={change.staged}
                  disabled={togglingPath !== null}
                  onChange={() => void toggleStaged(change)}
                  aria-label={`Stage ${change.path}`}
                />
                <button
                  type="button"
                  className="git-panel-file-button"
                  onClick={() => setSelectedPath(change.path)}
                >
                  <span className="git-panel-file-status" data-status={change.status}>{change.status[0]}</span>
                  <span className="git-panel-file-path">{change.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="git-panel-diff">
          {selected ? (
            <>
              <div className="git-panel-diff-header">
                <code>{selected.path}</code>
                <span className="git-panel-file-status" data-status={selected.status}>{selected.status}</span>
                <span className="git-panel-diff-scope">{selected.staged ? 'Staged' : 'Working tree'}</span>
              </div>
              {diffLoading && (
                <div className="git-panel-loading">
                  <LoaderCircle size={15} className="spin" />
                  <span>Loading diff...</span>
                </div>
              )}
              {diffError && (
                <div className="git-panel-error" role="alert">
                  <AlertCircle size={14} />
                  <span>{diffError}</span>
                </div>
              )}
              {!diffLoading && !diffError && <DiffView diff={diff} />}
            </>
          ) : (
            <p className="git-panel-empty">Select a file to preview its diff.</p>
          )}
        </main>
      </div>

      <footer className="git-panel-commit">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={stagedPaths.length > 0
            ? `Commit message for ${stagedPaths.length} staged file${stagedPaths.length === 1 ? '' : 's'}...`
            : 'Stage at least one file to commit...'}
          disabled={committing}
          rows={2}
        />
        <button
          type="button"
          className="git-panel-commit-button"
          disabled={committing || stagedPaths.length === 0 || !message.trim()}
          onClick={() => void commit()}
        >
          {committing ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
          {committing ? 'Committing' : `Commit ${stagedPaths.length}`}
        </button>
        {commitError && (
          <div className="git-panel-error" role="alert">
            <AlertCircle size={14} />
            <span>{commitError}</span>
          </div>
        )}
      </footer>
    </section>
  );
}
