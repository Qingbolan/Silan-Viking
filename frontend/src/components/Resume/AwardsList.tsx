import React from 'react';
import { motion } from 'framer-motion';
import { Award } from 'lucide-react';

interface AwardsListProps {
  awards: string[];
}

// Extract a trailing year like "2024" from the award line for editorial display.
const splitYear = (line: string): { year?: string; text: string } => {
  const trailing = line.match(/^(.*?)[\s,·•-]+(\b(19|20)\d{2}\b)\s*$/);
  if (trailing) {
    return { text: trailing[1].trim().replace(/[,·•-]+$/, '').trim(), year: trailing[2] };
  }
  const leading = line.match(/^\s*(\b(19|20)\d{2}\b)[\s,·•-]+(.*)$/);
  if (leading) {
    return { text: leading[3].trim(), year: leading[1] };
  }
  return { text: line };
};

const AwardsList: React.FC<AwardsListProps> = ({ awards }) => {
  return (
    <ul className="space-y-2.5">
      {awards.map((award, index) => {
        const { year, text } = splitYear(award);
        return (
          <motion.li
            key={index}
            className="group/award flex items-start gap-3 rounded-xl bg-theme-surface p-3.5 transition-colors duration-200 hover:bg-theme-hover sm:p-4"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-theme-primary/10 text-theme-accent"
            >
              <Award size={15} />
            </span>

            <div className="min-w-0 flex-1">
              {year && (
                <span className="mr-2 inline-block align-middle font-mono text-[0.7rem] font-medium tracking-wider text-theme-accent">
                  {year}
                </span>
              )}
              <span className="align-middle text-sm leading-relaxed text-theme-secondary">
                {text}
              </span>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
};

export default AwardsList;
