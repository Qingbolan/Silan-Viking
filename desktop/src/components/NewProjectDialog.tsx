import React from 'react';
import { AlertCircle, FolderPlus, LoaderCircle } from 'lucide-react';
import { slugPreview } from '../lib/format';

type NewProjectDialogProps = {
  title: string;
  onTitleChange: (value: string) => void;
  submitting: boolean;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onCancel: () => void;
  onSubmit: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
};

export function NewProjectDialog({
  title,
  onTitleChange,
  submitting,
  error,
  inputRef,
  onCancel,
  onSubmit,
  onKeyDown,
}: NewProjectDialogProps) {
  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog-card new-project-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="new-project-badge">
          <FolderPlus size={17} />
        </div>
        <h3 id="new-project-title">New project</h3>
        <p>Creates a real content/project source with an overview Part, then opens it for editing.</p>
        <label className="new-project-field">
          <input
            ref={inputRef}
            className="dialog-input"
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={submitting}
            placeholder="Project title"
            aria-label="Project title"
          />
          <span className="new-project-slug">
            content/resources/projects/{title.trim() ? slugPreview(title) : '...'}
          </span>
        </label>
        {error && (
          <div className="dialog-error" role="alert">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="cancel" disabled={submitting} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={`primary ${submitting ? 'pending' : ''}`}
            disabled={!title.trim() || submitting}
            onClick={onSubmit}
          >
            {submitting ? <LoaderCircle size={15} /> : <FolderPlus size={15} />}
            {submitting ? 'Creating' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  );
}
