import React from 'react';
import { motion } from 'framer-motion';

interface PublicationsListProps {
  publications: string[];
}

// Pull a trailing or leading 4-digit year out of a publication line so it
// can be shown as an editorial marginal label, paper-bibliography style.
const splitYear = (line: string): { year?: string; text: string } => {
  const trailing = line.match(/^(.*?)[\s,·•-]+(\b(19|20)\d{2}\b)[).\s]*$/);
  if (trailing) {
    return { text: trailing[1].trim().replace(/[,·•-]+$/, '').trim(), year: trailing[2] };
  }
  const leading = line.match(/^\s*\(?(\b(19|20)\d{2}\b)\)?[\s,·•-]+(.*)$/);
  if (leading) {
    return { text: leading[3].trim(), year: leading[1] };
  }
  return { text: line };
};

// Borderless academic bibliography: numbered entries on a tinted surface,
// separation by surface layer + spacing, never by a stroke.
const PublicationsList: React.FC<PublicationsListProps> = ({ publications }) => {
  return (
    <ol className="space-y-2">
      {publications.map((publication, index) => {
        const { year, text } = splitYear(publication);
        return (
          <motion.li
            key={index}
            className="group/pub flex items-start gap-3 rounded-xl bg-theme-surface/60 p-3.5 transition-colors duration-200 hover:bg-theme-surface sm:p-4"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.35, delay: index * 0.05 }}
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-6 min-w-[1.5rem] flex-shrink-0 items-center justify-center rounded-md bg-theme-background/80 px-1.5 font-mono text-[0.7rem] font-medium text-theme-tertiary"
            >
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <span className="align-middle text-sm leading-relaxed text-theme-secondary">
                {text}
              </span>
              {year && (
                <span className="ml-2 inline-block align-middle font-mono text-[0.7rem] font-medium tracking-wider text-theme-accent">
                  {year}
                </span>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
};

export default PublicationsList;
