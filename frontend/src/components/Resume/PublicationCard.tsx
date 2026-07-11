// src/components/Resume/PublicationCard.tsx
//
// A single publication, rendered as a vertical card for a masonry grid
// in the style of an academic portfolio: a figure on top, then the
// title, an optional award badge, the venue · year line, a short
// abstract, the author list (owner emphasised), topic tags and a row of
// outlined link buttons — Paper / PDF / Code / Blog.
import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Github, Newspaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import Markdown from '../ui/Markdown';

export interface PublicationCardData {
  id: string;
  title: string;
  authors?: string;
  /** Journal / conference — the venue. */
  venue?: string;
  year?: string;
  /** One-line abstract / summary. */
  abstract?: string;
  /** Award badge text (e.g. "Distinguished Paper Award"). */
  award?: string;
  /** Topic / field tags. */
  tags?: string[];
  citations?: number;
  /** DOI / external paper link. */
  url?: string;
  /** Direct PDF link. */
  pdfUrl?: string;
  /** Code repository link. */
  githubUrl?: string;
  /** Related blog post link. */
  blogUrl?: string;
  /** Optional figure / cover image. */
  image?: string;
  /** preprint / conference / journal / workshop — drives the type badge. */
  publicationType?: string;
}

interface PublicationCardProps {
  publication: PublicationCardData;
  /** Ordinal — used only for the entrance stagger. */
  index: number;
  /** Author name to emphasise (the résumé owner). */
  highlightAuthor?: string;
}

// Render the author list, emphasising the owner's name where it appears.
const renderAuthors = (authors: string, highlight?: string): React.ReactNode => {
  if (!highlight) return authors;
  const parts = authors.split(/,\s*/);
  return parts.map((name, i) => {
    const isOwner = name.toLowerCase().includes(highlight.toLowerCase());
    return (
      <React.Fragment key={i}>
        {i > 0 && ', '}
        <span className={isOwner ? 'font-semibold text-ds-fg' : undefined}>
          {name}
        </span>
      </React.Fragment>
    );
  });
};

// The leading venue acronym for the award badge — e.g. "AAAI 2023" → "AAAI".
const venueAcronym = (venue?: string): string | undefined =>
  venue?.trim().split(/\s+/)[0];

/** Trim a date / datetime to YYYY-MM. Accepts "2025-09-01", "2025-09", or any
 * ISO-ish prefix; returns the empty string when nothing parseable is at the
 * head. We avoid `new Date(...)` so a missing day doesn't drift across the
 * month boundary in non-UTC locales. */
const formatYearMonth = (raw?: string): string => {
  if (!raw) return '';
  const m = raw.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return raw;
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
};

/** Per-type visual treatment for the publication_type badge.
 *  - conference / journal / workshop: peer-reviewed venues → primary tone
 *  - preprint: not peer-reviewed → neutral, quieter
 *  - unknown / missing: skipped */
const typeBadgeClass = (type?: string): string | null => {
  if (!type) return null;
  switch (type.toLowerCase()) {
    case 'conference':
      return 'border-ds-primary/40 bg-ds-primary-soft text-ds-primary';
    case 'journal':
      return 'border-ds-success/40 bg-ds-success-soft text-ds-success';
    case 'workshop':
      return 'border-ds-warning/40 bg-ds-warning-soft text-ds-warning';
    case 'preprint':
      return 'border-ds-border bg-ds-surface-2 text-ds-fg-subtle';
    default:
      return 'border-ds-border bg-ds-surface-2 text-ds-fg-muted';
  }
};

/** An outlined pill link — Paper / PDF / Code / Blog. */
const LinkPill: React.FC<{ href: string; icon: React.ReactNode; label: string }> = ({
  href,
  icon,
  label,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={cn(
      'inline-flex items-center gap-1 rounded-ds-sm border border-ds-border px-2 py-0.5',
      'text-ds-2xs font-medium uppercase tracking-[0.06em] text-ds-fg-muted',
      'transition-colors duration-ds-fast ease-ds-standard',
      'hover:border-ds-primary/40 hover:bg-ds-primary-soft hover:text-ds-primary',
      '[&_svg]:size-3',
    )}
  >
    {icon}
    {label}
  </a>
);

const PublicationCard: React.FC<PublicationCardProps> = ({
  publication,
  index,
  highlightAuthor,
}) => {
  const { t } = useTranslation();
  const {
    title, authors, venue, year, abstract, award, tags = [],
    url, pdfUrl, githubUrl, blogUrl, image, publicationType,
  } = publication;
  const yearMonth = formatYearMonth(year);
  const typeClass = typeBadgeClass(publicationType);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className={cn(
        'group flex flex-col rounded-ds-lg border border-ds-border bg-ds-surface-1',
        'transition-[border-color,box-shadow] duration-ds-fast ease-ds-standard',
        'hover:border-ds-primary/40 hover:shadow-ds-2',
      )}
    >
      {/* Figure — inset on a tinted plate, like a paper teaser. */}
      {image && (
        <div className="p-3">
          <div className="overflow-hidden rounded-ds-md border border-ds-border bg-white">
            <img
              src={image}
              alt={title}
              loading="lazy"
              className="h-44 w-full object-contain transition-transform duration-ds-normal ease-ds-emphasized group-hover:scale-[1.02]"
            />
          </div>
        </div>
      )}

      {/* Body. Tightened type scale (silan, 2026-05-22): a publications
          card is a list item, not a hero — drop every level by one step.
          Title md (was xl), abstract sm (was base), authors xs (was sm),
          meta line stays xs but loses its block-shouting all-caps look. */}
      <div className="flex flex-1 flex-col gap-2.5 p-5 pt-2">
        {/* Title. */}
        <h3 className="text-ds-md font-semibold leading-snug tracking-[-0.01em] text-ds-fg">
          {title}
        </h3>

        {/* Award badge — split pill: dark venue acronym + red award name. */}
        {award && (
          <div className="inline-flex w-fit overflow-hidden rounded-ds-sm text-ds-2xs font-semibold">
            {venueAcronym(venue) && (
              <span className="bg-ds-fg px-2 py-0.5 uppercase tracking-[0.04em] text-ds-surface-1">
                {venueAcronym(venue)}
              </span>
            )}
            <span className="bg-ds-error px-2 py-0.5 text-white">{award}</span>
          </div>
        )}

        {/* Meta row — type badge · venue · year-month.
            Type badge is colour-coded so a peer-reviewed conference reads
            differently from a preprint at a glance. Venue is rendered as
            an emphasised foreground line (not the muted all-caps it was)
            so KDD 2026 / Springer CCIS is the second thing the eye lands
            on after the title. Date is trimmed to YYYY-MM. */}
        {(publicationType || venue || yearMonth) && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {publicationType && typeClass && (
              <span
                className={cn(
                  'inline-flex items-center rounded-ds-sm border px-2 py-0.5',
                  'text-[0.65rem] font-semibold uppercase tracking-[0.08em]',
                  typeClass,
                )}
              >
                {publicationType}
              </span>
            )}
            {venue && (
              <span className="text-ds-xs font-semibold text-ds-fg">
                {venue}
              </span>
            )}
            {yearMonth && (
              <span className="text-ds-2xs font-mono text-ds-fg-subtle">
                {yearMonth}
              </span>
            )}
          </div>
        )}

        {/* Abstract — short summary. Markdown so links / emphasis render. */}
        {abstract && (
          <Markdown className="text-ds-sm leading-relaxed text-ds-fg-muted [&>div]:my-0">
            {abstract}
          </Markdown>
        )}

        {/* Authors — owner emphasised. */}
        {authors && (
          <p className="text-ds-xs leading-relaxed text-ds-fg-subtle">
            <span className="font-semibold text-ds-fg-muted">
              {t('resume.authors', { defaultValue: 'Authors' })}:{' '}
            </span>
            {renderAuthors(authors, highlightAuthor)}
          </p>
        )}

        {/* Tags. */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-ds-sm border border-ds-border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.06em] text-ds-fg-subtle"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Links — outlined pills. */}
        {(url || pdfUrl || githubUrl || blogUrl) && (
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {url && <LinkPill href={url} icon={<FileText />} label="Paper" />}
            {pdfUrl && <LinkPill href={pdfUrl} icon={<FileText />} label="PDF" />}
            {githubUrl && <LinkPill href={githubUrl} icon={<Github />} label="GitHub" />}
            {blogUrl && <LinkPill href={blogUrl} icon={<Newspaper />} label="Blog" />}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default PublicationCard;
