type RefreshConfirmDialogProps = {
  dirtyCount: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RefreshConfirmDialog({ dirtyCount, onCancel, onConfirm }: RefreshConfirmDialogProps) {
  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="refresh-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="refresh-confirm-title">Discard {dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}?</h3>
        <p>Refreshing reloads the source tree and discards Markdown edits that haven&apos;t been saved yet.</p>
        <div className="dialog-actions">
          <button type="button" className="cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="destructive" onClick={onConfirm}>Discard and refresh</button>
        </div>
      </div>
    </div>
  );
}
