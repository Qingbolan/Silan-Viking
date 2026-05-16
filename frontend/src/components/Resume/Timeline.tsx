import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, MapPin } from 'lucide-react';

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

const Timeline: React.FC<TimelineProps> = ({ items }) => {
  return (
    <ol className="space-y-6">
      {items.map((item, index) => (
        <motion.li
          key={`${item.title}-${index}`}
          className="group relative"
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: index * 0.08 }}
        >
          <div className="space-y-3">
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
                {/* Date pill */}
                <div className="mb-1.5 inline-flex items-center gap-1.5 px-0 py-0 font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-theme-tertiary">
                  {item.date}
                </div>

                <h4 className="text-lg font-bold leading-tight tracking-[-0.01em] text-theme-primary">
                  {item.title}
                </h4>

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
              <div className="rounded-xl bg-theme-surface p-4 transition-colors duration-300">
                <ul className="space-y-1.5">
                  {item.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className="select-none font-mono text-sm leading-relaxed text-theme-tertiary"
                      >
                        –
                      </span>
                      <span className="text-sm leading-relaxed text-theme-secondary">
                        {detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.li>
      ))}
    </ol>
  );
};

export default Timeline;
