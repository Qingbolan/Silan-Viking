// src/components/ds/Tooltip.tsx
//
// Design-system Tooltip — a lightweight hover/focus label. Portalled so it
// never clips; positioned against the trigger's bounding box. Appears after
// a short delay, on an Acrylic chip.
import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

type Side = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The tooltip text/content. */
  content: React.ReactNode;
  side?: Side;
  /** Show delay in ms. */
  delay?: number;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  side = 'top',
  delay = 250,
  children,
}) => {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const triggerRef = React.useRef<HTMLElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    timer.current = setTimeout(() => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 8;
      const map: Record<Side, { x: number; y: number }> = {
        top: { x: r.left + r.width / 2, y: r.top - gap },
        bottom: { x: r.left + r.width / 2, y: r.bottom + gap },
        left: { x: r.left - gap, y: r.top + r.height / 2 },
        right: { x: r.right + gap, y: r.top + r.height / 2 },
      };
      setPos(map[side]);
      setOpen(true);
    }, delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  React.useEffect(() => () => clearTimeout(timer.current), []);

  // The translate keeps the chip anchored relative to its side.
  const translate: Record<Side, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  };

  const trigger = React.cloneElement(children, {
    ref: triggerRef,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  });

  return (
    <>
      {trigger}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              {...dsRoot}
              role="tooltip"
              className={cn(
                'pointer-events-none fixed ds-acrylic rounded-ds-sm px-2 py-1',
                'text-ds-2xs font-medium text-ds-fg',
              )}
              style={{ left: pos.x, top: pos.y, transform: translate[side], zIndex: 1200 }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.12 }}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
};
