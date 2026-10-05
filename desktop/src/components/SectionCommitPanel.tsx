import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, GitBranch, LoaderCircle, Send, X } from 'lucide-react';
import type { VersionScope, VersionStatus } from '../types';
import { sectionCommitAvailability, defaultSectionCommitMessage } from '../lib/sectionCommit';
import { ModalLayer } from './ModalLayer';

/**
 * Version status and commit preview for one content section. A section commit
 * always goes through this preview: the changed files, each file's diff, and
 * an editable message are visible before anything is committed.
 */
export function SectionCommitPanel({
  scope,
  unsavedCount,
  onClose,
  onCommitted,
}: {
  scope: VersionScope;
  /** Open editor drafts that must be saved before a commit. */
  unsavedCount: number;
  onClose: () => void;
  onCommitted: (status: VersionStatus) => void | Promise<void>;
}) {
  const [status, setStatus] = React.useState<VersionStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [diff, setDiff] = React.useState('');
  const [diffError, setDiffError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState(defaultSectionCommitMessage(scope));
  const [committing, setCommitting] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    invoke<VersionStatus>('get_version_status', { scope })
      .then((next) => {
        if (!active) return;
        setStatus(next);
        setSelectedPath(next.changes[0]?.path ?? null);
      })
      .catch((reason) => { if (active) setError(String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope]);

  React.useEffect(() => {
    if (!selectedPath) {
      setDiff('');
      return undefined;
    }
    let active = true;
    setDiffError(null);
    invoke<string>('get_release_file_diff', { scope, path: selectedPath })
      .then((next) => { if (active) setDiff(next); })
      .catch((reason) => { if (active) setDiffError(String(reason)); });
    return () => { active = false; };
  }, [scope, selectedPath]);

  const availability = sectionCommitAvailability({
    label: status?.scope_label || 'This section',
    changeCount: status?.dirty_count ?? null,
    unsavedCount,
    message,
  });

  const commit = async () => {
    if (!availability.enabled || committing) return;
    setCommitting(true);
    setError(null);
    try {
      const next = await invoke<VersionStatus>('release_scope', { scope, message: message.trim() });
      setStatus(next);
      setSelectedPath(next.changes[0]?.path ?? null);
      setMessage(defaultSectionCommitMessage(scope));
      await onCommitted(next);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <ModalLayer
      cardClassName="version-card section-commit-card"
      labelledBy="section-commit-title"
      dismissible={!committing}
      onClose={onClose}
    >
      <div className="dialog-headline">
        <div className="new-project-badge"><GitBranch size={17} /></div>
        <button
          type="button"
          className="language-close-button"
          aria-label="Close version status"
          disabled={committing}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      <header className="workspace-settings-section-header">
        <h2 id="section-commit-title">Commit {status?.scope_label || 'section'} changes</h2>
        <p>Review the changed files and their diff, then commit with your message.</p>
      </header>

      {loading ? (
        <div className="version-loading"><LoaderCircle size={15} /><span>Reading Git status...</span></div>
      ) : status ? (
        <>
          <div className="version-summary">
            <div><span>Branch</span><strong>{status.branch}</strong></div>
            <div><span>HEAD</span><strong>{status.head}</strong></div>
            <div><span>Changes</span><strong>{status.dirty_count}</strong></div>
          </div>
          <section className="version-section">
            <div className="version-section-head"><h3>Working tree</h3></div>
            {status.changes.length === 0 ? (
              <div className="version-empty">Clean working tree. Nothing to commit.</div>
            ) : (
              <div className="section-commit-preview">
                <div className="version-change-list" role="listbox" aria-label="Changed files">
                  {status.changes.map((change) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={change.path === selectedPath}
                      className="version-change-row"
                      key={`${change.status}:${change.path}`}
                      onClick={() => setSelectedPath(change.path)}
                    >
                      <span>{change.status}</span>
                      <strong>{change.path}</strong>
                    </button>
                  ))}
                </div>
                {diffError ? (
                  <div className="dialog-error" role="alert"><AlertCircle size={14} /><span>{diffError}</span></div>
                ) : (
                  <pre className="git-diff-view section-commit-diff" aria-label="File diff">
                    {diff.split('\n').map((line, index) => (
                      <span
                        key={index}
                        className="git-diff-line"
                        data-tone={line.startsWith('+') && !line.startsWith('+++')
                          ? 'add'
                          : line.startsWith('-') && !line.startsWith('---') ? 'remove' : line.startsWith('@@') ? 'hunk' : undefined}
                      >
                        {line || ' '}
                      </span>
                    ))}
                  </pre>
                )}
              </div>
            )}
          </section>
          {status.changes.length > 0 && (
            <label className="section-commit-message">
              <span>Commit message</span>
              <textarea
                rows={2}
                value={message}
                disabled={committing}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
          )}
          <div className="dialog-actions">
            <button type="button" className="cancel" disabled={committing} onClick={onClose}>Close</button>
            <button
              type="button"
              className="primary"
              disabled={!availability.enabled || committing}
              title={availability.reason || undefined}
              onClick={() => void commit()}
            >
              {committing ? <LoaderCircle size={14} /> : <Send size={14} />}
              {committing ? 'Committing' : `Commit ${status.dirty_count} file${status.dirty_count === 1 ? '' : 's'}`}
            </button>
          </div>
          {availability.reason && status.changes.length > 0 && (
            <p className="section-commit-reason" role="note">{availability.reason}</p>
          )}
          <section className="version-section">
            <div className="version-section-head"><h3>Recent commits</h3></div>
            <div className="version-commit-list">
              {status.recent_commits.length === 0 && <div className="version-empty">No commits yet.</div>}
              {status.recent_commits.map((recent) => (
                <div className="version-commit-row" key={recent.hash}>
                  <code>{recent.hash}</code>
                  <strong>{recent.subject}</strong>
                  <span>{recent.relative_time}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
      {error && (
        <div className="dialog-error" role="alert"><AlertCircle size={14} /><span>{error}</span></div>
      )}
    </ModalLayer>
  );
}
