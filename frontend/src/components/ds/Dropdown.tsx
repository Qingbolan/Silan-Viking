// src/components/ds/Dropdown.tsx
//
// Design-system Dropdown menu — a trigger + a portalled Acrylic menu.
// Closes on outside click, Escape, or item selection.
import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

export interface DropdownItem {
  /** Stable key. */
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Show a trailing check (for selected state). */
  selected?: boolean;
  /** Render as a destructive action. */
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export interface DropdownProps {
  /** The clickable trigger element. */
  trigger: React.ReactElement;
  items: (DropdownItem | 'separator')[];
  /** Horizontal alignment of the menu against the trigger. */
  align?: 'start' | 'end';
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  align = 'start',
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const triggerRef = React.useRef<HTMLElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const toggle = () => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
    setOpen((o) => !o);
  };

  // Close on outside click + Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerEl = React.cloneElement(trigger, {
    ref: triggerRef,
    onClick: toggle,
    'aria-expanded': open,
    'aria-haspopup': 'menu',
  });

  return (
    <>
      {triggerEl}
      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={menuRef}
              {...dsRoot}
              role="menu"
              className={cn(
                'fixed min-w-[12rem] rounded-ds-md ds-acrylic p-1',
                className,
              )}
              style={{
                top: rect.bottom + 6,
                left: align === 'start' ? rect.left : undefined,
                right: align === 'end' ? window.innerWidth - rect.right : undefined,
                zIndex: 1150,
                boxShadow: 'var(--ds-elevation-3)',
              }}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
              {items.map((item, i) =>
                item === 'separator' ? (
                  <div key={`sep-${i}`} className="my-1 h-px bg-ds-border" />
                ) : (
                  <button
                    key={item.key}
                    {...dsRoot}
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      item.onSelect?.();
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-ds-sm px-2.5 py-1.5 text-left text-ds-sm',
                      'transition-colors duration-ds-fast ease-ds-standard',
                      'disabled:pointer-events-none disabled:opacity-40',
                      '[&_svg]:size-4 [&_svg]:shrink-0',
                      item.danger
                        ? 'text-ds-error hover:bg-ds-error-soft'
                        : 'text-ds-fg hover:bg-ds-surface-2',
                    )}
                  >
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {item.selected && <Check className="text-ds-primary" />}
                  </button>
                ),
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
};
