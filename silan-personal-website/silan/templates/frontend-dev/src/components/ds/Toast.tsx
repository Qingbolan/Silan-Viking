// src/components/ds/Toast.tsx
//
// Design-system Toast — transient notifications. Mount <ToastProvider> once
// near the app root, then call useToast() anywhere to push a toast.
//
//   const toast = useToast();
//   toast.success('Saved', 'Your changes are live.');
import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

type ToastTone = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: React.ReactNode;
  description?: React.ReactNode;
}

interface ToastApi {
  show: (tone: ToastTone, title: React.ReactNode, description?: React.ReactNode) => void;
  info: (title: React.ReactNode, description?: React.ReactNode) => void;
  success: (title: React.ReactNode, description?: React.ReactNode) => void;
  warning: (title: React.ReactNode, description?: React.ReactNode) => void;
  error: (title: React.ReactNode, description?: React.ReactNode) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

const toneIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle } as const;
const toneAccent = {
  info: 'text-ds-primary',
  success: 'text-ds-success',
  warning: 'text-ds-warning',
  error: 'text-ds-error',
} as const;

export const ToastProvider: React.FC<{
  children: React.ReactNode;
  /** Auto-dismiss delay in ms. */
  duration?: number;
}> = ({ children, duration = 4000 }) => {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const seq = React.useRef(0);

  const remove = React.useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = React.useCallback<ToastApi['show']>(
    (tone, title, description) => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, tone, title, description }]);
      setTimeout(() => remove(id), duration);
    },
    [duration, remove],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      show,
      info: (t, d) => show('info', t, d),
      success: (t, d) => show('success', t, d),
      warning: (t, d) => show('warning', t, d),
      error: (t, d) => show('error', t, d),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          {...dsRoot}
          className="pointer-events-none fixed bottom-4 right-4 flex w-80 flex-col gap-2"
          style={{ zIndex: 1200 }}
        >
          <AnimatePresence>
            {toasts.map((t) => {
              const Icon = toneIcon[t.tone];
              return (
                <motion.div
                  key={t.id}
                  {...dsRoot}
                  className="pointer-events-auto flex items-start gap-3 rounded-ds-md ds-acrylic ds-ridge p-3.5"
                  style={{ boxShadow: 'var(--ds-elevation-3)' }}
                  initial={{ opacity: 0, x: 40, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 40, scale: 0.96 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', toneAccent[t.tone])} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-ds-sm font-semibold text-ds-fg">{t.title}</div>
                    {t.description && (
                      <div className="text-ds-xs text-ds-fg-muted">{t.description}</div>
                    )}
                  </div>
                  <button
                    {...dsRoot}
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => remove(t.id)}
                    className="rounded-ds-sm p-0.5 text-ds-fg-subtle hover:bg-ds-surface-2 hover:text-ds-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

/** Push toasts from anywhere inside <ToastProvider>. */
export const useToast = (): ToastApi => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
};
