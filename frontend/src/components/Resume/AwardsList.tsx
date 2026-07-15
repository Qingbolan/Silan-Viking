import React from 'react';
import { motion } from 'framer-motion';
import { Award } from 'lucide-react';
import Markdown from '../ui/Markdown';
import { iconSrcForHref } from '../../utils/linkIcon';

interface AwardEntry {
  id?: string;
  title: string;
  description?: string;
  organization?: string;
  date?: string;
  category?: string;
  url?: string;
}

interface AwardsListProps {
  awards: Array<AwardEntry | string>;
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

const yearFromDate = (date?: string): string | undefined => date?.match(/\b(19|20)\d{2}\b/)?.[0];

const normalizeAward = (award: AwardEntry | string): AwardEntry => {
  if (typeof award !== 'string') return award;
  const { year, text } = splitYear(award);
  return { title: text, date: year };
};

const AwardsList: React.FC<AwardsListProps> = ({ awards }) => {
  return (
    <ul className="space-y-4">
      {awards.map((award, index) => {
        const item = normalizeAward(award);
        const year = yearFromDate(item.date);
        const meta = [year, item.category, item.organization].filter(Boolean).join(' · ');
        return (
          <motion.li
            key={item.id || `${item.title}-${index}`}
            className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4 gap-y-1 py-1"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
          >
            <span
              aria-hidden
              className="mt-1 inline-flex size-5 flex-shrink-0 items-center justify-center text-theme-accent"
            >
              <Award size={15} />
            </span>

            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-ds="rich-link"
                    className="rich-link max-w-full text-sm font-semibold"
                  >
                    <img
                      src={iconSrcForHref(item.url)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="rich-link__icon"
                    />
                    <span className="min-w-0 truncate">{item.title}</span>
                  </a>
                ) : (
                  <h3 className="text-sm font-semibold leading-6 text-theme-primary">
                    {item.title}
                  </h3>
                )}
              </div>

              {meta && (
                <div className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.16em] text-theme-tertiary">
                  {meta}
                </div>
              )}

              {item.description && (
                <Markdown
                  className="text-sm leading-6 text-theme-secondary [&>div]:!my-0 [&_p]:!my-0"
                >
                  {item.description}
                </Markdown>
              )}
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
};

export default AwardsList;
