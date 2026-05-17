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

// Borderless editorial section: separated from the page by a tinted
// surface fill + spacing, never a stroke. The header carries a numbered
// kicker for an academic, paper-like reading rhythm.
const SectionCard: React.FC<SectionCardProps> = ({
  title,
  children,
  delay = 0,
  icon,
  kicker,
  index,
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
      <header className="mb-6 flex items-start gap-3">
        {(index || icon) && (
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-theme-primary/10 text-theme-primary">
            {index ? (
              <span className="font-mono text-xs font-semibold tracking-wider">
                {index}
              </span>
            ) : (
              icon
            )}
          </div>
        )}
        <div className="min-w-0">
          {kicker && (
            <span className="block font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-theme-tertiary">
              {kicker}
            </span>
          )}
          <h3
            id={sectionId}
            className="text-xl font-semibold text-theme-primary sm:text-2xl"
          >
            {title}
          </h3>
        </div>
      </header>
      <div className="relative">{children}</div>
    </motion.section>
  );
};

export default SectionCard;
