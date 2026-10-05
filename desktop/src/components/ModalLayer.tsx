import React from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from './ds/Dialog';

/**
 * Top-layer host for the workspace's card dialogs (`.dialog-overlay` +
 * `.dialog-card`). Dialogs are portalled to `document.body` and stacked above
 * every workspace surface, including the full-screen content editor, so a
 * dialog opened from the editor is never rendered underneath it.
 */
export function ModalLayer({
  className = '',
  cardClassName = '',
  labelledBy,
  dismissible = true,
  onClose,
  children,
}: {
  className?: string;
  cardClassName?: string;
  labelledBy: string;
  /** False while an operation must finish before the dialog may close. */
  dismissible?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const cardRef = React.useRef<HTMLElement>(null);
  const close = React.useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);
  useModalFocus(true, cardRef, close);

  return createPortal(
    <div className={`dialog-overlay ${className}`} role="presentation" onClick={close}>
      <section
        ref={cardRef}
        tabIndex={-1}
        className={`dialog-card ${cardClassName}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
