import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, MapPin } from 'lucide-react';
import Markdown from '../ui/Markdown';

interface TimelineItem {
  title: string;
  subtitle: string;
  date: string;
  details: string[];
  logo?: string;
  website?: string;
  location?: string;
}

interface TimelineProps {
  items: TimelineItem[];
  variant?: 'primary' | 'secondary' | 'accent';
}

/**
 * Content is authored as one logical list but arrives from the content API as
 * string[]. Normalize plain entries into Markdown list rows while preserving
 * authors' existing `-`, `*`, or ordered-list syntax. Rendering the combined
 * document lets Markdown own emphasis, links, nested lists, and line breaks.
 */
const detailsToMarkdown = (details: string[]) =>
  details
    .map((detail) => {
      const content = detail.trim();
      if (!content) return '';
      if (/^(?:[-*+] |\d+[.)] )/.test(content)) return content;
      return `- ${content.replace(/\n/g, '\n  ')}`;
    })
    .filter(Boolean)
    .join('\n');

const Timeline: React.FC<TimelineProps> = ({ items }) => {
  return (
    <ol className="space-y-5 sm:space-y-6">
      {items.map((item, index) => (
        <motion.li
          key={`${item.title}-${index}`}
          className="group relative"
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: index * 0.08 }}
        >
          <div className="space-y-2.5">
            <div className="flex items-start gap-3">
              {item.logo && (
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-theme-surface p-1">
                  <img
                    src={item.logo}
                    alt={`${item.subtitle} logo`}
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h4 className="min-w-0 text-lg font-bold leading-tight tracking-[-0.01em] text-theme-primary">
                    {item.title}
                  </h4>
                  <span className="shrink-0 font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-theme-tertiary">
                    {item.date}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {item.website ? (
                    <a
                      href={item.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/link inline-flex items-center gap-1 font-medium text-theme-accent transition-colors hover:text-theme-primary"
                    >
                      {item.subtitle}
                      <ExternalLink
                        aria-hidden
                        focusable={false}
                        size={12}
                        className="opacity-0 transition-all duration-200 group-hover/link:opacity-100"
                      />
                    </a>
                  ) : (
                    <span className="font-medium text-theme-accent">{item.subtitle}</span>
                  )}

                  {item.location && (
                    <>
                      <span aria-hidden className="h-1 w-1 rounded-full bg-theme-secondary/50" />
                      <span className="inline-flex items-center gap-1 text-xs text-theme-tertiary">
                        <MapPin aria-hidden focusable={false} size={11} />
                        {item.location}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {item.details && Array.isArray(item.details) && item.details.length > 0 && (
              <div className="border-l border-ds-border pl-3">
                <Markdown
                  className={[
                    'text-sm leading-relaxed text-theme-secondary',
                    '[&>ul]:!my-0 [&>ul]:!space-y-2 [&>ul]:!pl-4',
                    '[&_li]:!my-0 [&_li]:!pl-1 [&_li]:!leading-6',
                    '[&_p]:!my-0 [&_p]:!leading-6',
                  ].join(' ')}
                >
                  {detailsToMarkdown(item.details)}
                </Markdown>
              </div>
            )}
          </div>
        </motion.li>
      ))}
    </ol>
  );
};

export default Timeline;
