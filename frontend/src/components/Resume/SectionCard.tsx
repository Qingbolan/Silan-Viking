import React from 'react';
import { motion } from 'framer-motion';

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  delay?: number;
  icon?: React.ReactNode;
  /** Small uppercase label above the title, e.g. "Career". */
  kicker?: string;
  /** Editorial section number, e.g. "01". */
  index?: string;
}

// Editorial section. The header is a single centred pill — just the
// section title — replacing the previous icon+kicker+index+heading stack
// (silan, 2026-05-22: too many decorations stacked over the content).
// `kicker` and `index` are still accepted for prop-compat with existing
// callers but no longer rendered.
const SectionCard: React.FC<SectionCardProps> = ({
  title,
  children,
  delay = 0,
  icon: _icon,
  kicker: _kicker,
  index: _index,
}) => {
  const sectionId = `section-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <motion.section
      className="bg-theme-surface rounded-xl p-6 shadow-sm transition-shadow duration-300 hover:shadow-md sm:p-8"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      aria-labelledby={sectionId}
    >
      <header className="mb-8 flex justify-center">
        <h3
          id={sectionId}
          className={
            'inline-flex items-center rounded-full border border-ds-border ' +
            'bg-ds-surface-1 px-5 py-1.5 text-ds-sm font-semibold ' +
            'tracking-wide text-ds-fg sm:text-ds-base'
          }
        >
          {title}
        </h3>
      </header>
      <div className="relative">{children}</div>
    </motion.section>
  );
};

export default SectionCard;
