// src/components/ds/Modal.tsx
//
// Design-system Modal — a portalled dialog on an Acrylic panel.
// Scrim fades; the panel pops in with a Fluent back-eased scale. Closes on
// Escape and scrim click; locks body scroll while open.
import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Footer content — actions live here. */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Hide the top-right close button. */
  hideClose?: boolean;
  children?: React.ReactNode;
  className?: string;
}

const sizeMap = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  hideClose = false,
  children,
  className,
}) => {
  // Escape to close + body scroll lock while open.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          {...dsRoot}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 1100 }}
          role="dialog"
          aria-modal="true"
        >
          {/* Scrim */}
          <motion.div
            className="absolute inset-0 bg-ds-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            className={cn(
              'relative w-full rounded-ds-xl ds-acrylic ds-ridge p-6',
              sizeMap[size],
              className,
            )}
            style={{ boxShadow: 'var(--ds-elevation-4)' }}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {!hideClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                onClick={onClose}
                className="absolute right-3 top-3"
              >
                <X />
              </Button>
            )}
            {(title || description) && (
              <div className="mb-4 space-y-1 pr-8">
                {title && (
                  <h2 className="text-ds-xl font-semibold tracking-[-0.01em] text-ds-fg">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-ds-sm text-ds-fg-muted">{description}</p>
                )}
              </div>
            )}
            {children && <div className="text-ds-base text-ds-fg">{children}</div>}
            {footer && (
              <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
