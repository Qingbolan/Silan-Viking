// src/components/ds/BrandLoading.tsx
//
// Branded loading states.
//
//   <BrandLoading />           full-screen — the app boot / route splash
//   <BrandLoading inline />    centred block — fills a card / panel
//
// The mark draws itself in on a loop; an optional rotating message keeps a
// long wait from feeling stalled. The plain <Spinner> (Feedback.tsx) is
// still the right pick for small, in-control loading.
import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { LogoMark } from './Logo';
import { NoiseBackground } from './NoiseBackground';

export interface BrandLoadingProps {
  /** Headline under the mark. Defaults to the i18n `ds.loading.title`. */
  message?: string;
  /**
   * Rotating sub-messages — cycled every 3.5s to reassure on long waits.
   * Defaults to the i18n `ds.loading.hints`; pass [] to disable.
   */
  hints?: string[];
  /** Render as a centred block instead of a fixed full-screen overlay. */
  inline?: boolean;
  className?: string;
}

export const BrandLoading: React.FC<BrandLoadingProps> = ({
  message,
  hints,
  inline = false,
  className,
}) => {
  const { t } = useTranslation();
  const [hintIdx, setHintIdx] = React.useState(0);

  // Fall back to the localised defaults when no prop is given.
  const headline = message ?? t('ds.loading.title');
  const resolvedHints =
    hints ?? (t('ds.loading.hints', { returnObjects: true }) as string[]);

  React.useEffect(() => {
    if (resolvedHints.length === 0) return;
    setHintIdx(0);
    const id = setInterval(
      () => setHintIdx((i) => (i + 1) % resolvedHints.length),
      3500,
    );
    return () => clearInterval(id);
  }, [resolvedHints.length]);

  const body = (
    <div className="flex flex-col items-center gap-5 text-center">
      {/* The brand mark with a sweeping NUS-orange progress ring. */}
      <LogoMark size={inline ? 56 : 76} animated />

      <div className="space-y-1.5">
        <div className="text-ds-base font-semibold text-ds-fg">{headline}</div>
        {resolvedHints.length > 0 && (
          <div className="h-4 overflow-hidden">
            <motion.div
              key={hintIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="text-ds-xs text-ds-fg-muted"
            >
              {resolvedHints[hintIdx]}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div
        {...dsRoot}
        role="status"
        aria-live="polite"
        className={cn('flex min-h-[16rem] items-center justify-center p-8', className)}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      {...dsRoot}
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-0 flex items-center justify-center bg-ds-canvas',
        className,
      )}
      style={{ zIndex: 1200 }}
    >
      {/* The same NUS desk material behind the mark. */}
      <NoiseBackground glow="nus-duo" intensity={0.05} />
      <div className="relative z-10">{body}</div>
    </div>
  );
};
