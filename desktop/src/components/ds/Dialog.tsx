// src/components/ds/Dialog.tsx
//
// Design-system Dialog — a modal composition. `Dialog` owns the behaviour
// (portal, overlay click-to-close, Esc, autofocus, focus trap, focus
// restore); `DialogCard` / `DialogTitle` / `DialogDescription` /
// `DialogActions` are the visual slots. Portalled to document.body like
// Tooltip so it never clips; stacked at --ds-z-modal (1100).
import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

/* --- Dialog — portal + behaviour ------------------------------------------ */

export interface DialogProps {
  open: boolean;
  /** Called on Esc, overlay click. */
  onClose: () => void;
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Dialog: React.FC<DialogProps> = ({ open, onClose, children }) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);

  // Capture the previously focused element once per open, restore on close.
  React.useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    return () => restoreRef.current?.focus?.();
  }, [open]);

  // Autofocus: the first [data-autofocus] inside the card, else the card.
  React.useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const target = card.querySelector<HTMLElement>('[data-autofocus]') ?? card;
    target.focus();
  }, [open]);

  // Esc closes; Tab cycles within the card (simple focus trap).
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card) return;
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !card.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !card.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div {...dsRoot} className="fixed inset-0 z-[1100]">
      {/* Overlay — click outside the card closes. */}
      <div
        className="absolute inset-0 bg-ds-overlay backdrop-blur-sm ds-animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      {/* Centering container — pointer-events pass through except on the card. */}
      <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
        <div ref={cardRef} tabIndex={-1} className="pointer-events-auto outline-none">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};
Dialog.displayName = 'Dialog';

/* --- DialogCard — the surface --------------------------------------------- */

export const DialogCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...dsRoot}
    role="dialog"
    aria-modal="true"
    className={cn(
      'w-full max-w-md rounded-ds-xl border border-ds-border bg-ds-surface-1 p-5 shadow-ds-4',
      'ds-animate-pop-in',
      className,
    )}
    {...props}
  />
));
DialogCard.displayName = 'DialogCard';

/* --- Slots ----------------------------------------------------------------- */

export const DialogTitle: React.FC<React.HTMLAttributes<HTMLElement>> = ({
  className,
  ...props
}) => (
  <h2
    className={cn('text-ds-lg font-semibold tracking-[-0.01em] text-ds-fg', className)}
    {...props}
  />
);

export const DialogDescription: React.FC<React.HTMLAttributes<HTMLElement>> = ({
  className,
  ...props
}) => (
  <p className={cn('mt-1.5 text-ds-sm leading-relaxed text-ds-fg-muted', className)} {...props} />
);

export const DialogActions: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={cn('mt-4 flex justify-end gap-2', className)} {...props} />;
