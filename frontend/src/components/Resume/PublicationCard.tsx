// src/components/Resume/PublicationCard.tsx
//
// A single publication, rendered as a compact editorial list item: teaser
// image, title and venue lead; authors, abstract and links follow without a
// second nested card competing with the section that already contains it.
import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, FileText, Github, MapPin, Newspaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import Markdown from '../ui/Markdown';

export interface PublicationCardData {
  id: string;
  title: string;
  authors?: string;
  /** Journal / conference — the venue. */
  venue?: string;
  /** Full official venue name, displayed as a linked secondary line. */
  venueFullName?: string;
  /** Official conference / journal website. */
  venueUrl?: string;
  /** Host city / country, shown with the full official venue name. */
  venueLocation?: string;
  /** CCF venue ranking, deliberately supplied by content rather than inferred. */
  ccfRank?: 'A' | 'B' | 'C';
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
  /** Public talk or presentation deck. */
  slidesUrl?: string;
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

/** A compact, formal venue classification badge — CCF wordmark + rank seal. */
const CcfBadge: React.FC<{ rank: 'A' | 'B' | 'C' }> = ({ rank }) => (
  <span
    title={`CCF ${rank} conference`}
    className="inline-flex h-7 items-center gap-1 rounded-full border border-[#003D7C]/25 bg-[#003D7C]/[0.08] py-0.5 pl-2 pr-1 text-[#003D7C] dark:border-[#8AB5F5]/30 dark:bg-[#8AB5F5]/10 dark:text-[#A8C7FA]"
  >
    <span className="font-mono text-[0.625rem] font-semibold tracking-[0.12em]">CCF</span>
    <span className="flex size-5 items-center justify-center rounded-full bg-[#003D7C] text-[0.6875rem] font-bold text-white dark:bg-[#A8C7FA] dark:text-[#10213D]">
      {rank}
    </span>
  </span>
);

/** A compact resource control — Paper / PDF / Code / Slides / Blog. */
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
      'inline-flex min-h-9 items-center gap-1 rounded-full border border-ds-border px-3 py-1',
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
    title, authors, venue, venueFullName, venueUrl, venueLocation, ccfRank, year, abstract, award, tags = [],
    url, pdfUrl, githubUrl, slidesUrl, blogUrl, image, publicationType,
  } = publication;
  const yearMonth = formatYearMonth(year);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className={cn(
        'group grid gap-4 py-5 first:pt-0 sm:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1fr)] sm:gap-5 sm:py-6',
      )}
    >
      {/* Figure — a restrained teaser, no additional card frame. */}
      {image && (
        <div className="aspect-[16/9] overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface-2">
          <img
            src={image}
            alt={title}
            loading="lazy"
            className="size-full object-contain transition-transform duration-ds-normal ease-ds-emphasized group-hover:scale-[1.02]"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {/* Title. */}
        <h3 className="text-ds-lg font-semibold leading-snug tracking-[-0.02em] text-ds-fg sm:text-xl">
          {title}
        </h3>

        {/* Meta — rank first, then venue and date. */}
        {(ccfRank || publicationType || venue || yearMonth) && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {ccfRank && <CcfBadge rank={ccfRank} />}
            {publicationType && (
              <span className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.12em] text-ds-fg-subtle">
                {publicationType}
              </span>
            )}
            {venue && (venueUrl ? (
              <a
                href={venueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-ds-sm font-semibold text-ds-fg transition-colors hover:text-ds-primary"
              >
                {venue}
                <ExternalLink aria-hidden className="size-3" />
              </a>
            ) : (
              <span className="text-ds-sm font-semibold text-ds-fg">{venue}</span>
            ))}
            {yearMonth && <span className="text-ds-xs font-mono text-ds-fg-subtle">{yearMonth}</span>}
          </div>
        )}

        {venueFullName && (
          venueUrl ? (
            <a
              href={venueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-start gap-1 text-ds-xs leading-5 text-ds-fg-muted transition-colors hover:text-ds-primary"
            >
              <span>{venueFullName}</span>
              <ExternalLink aria-hidden className="mt-0.5 size-3 shrink-0" />
            </a>
          ) : (
            <p className="text-ds-xs leading-5 text-ds-fg-muted">{venueFullName}</p>
          )
        )}

        {venueLocation && (
          <span className="inline-flex items-center gap-1 text-ds-xs leading-5 text-ds-fg-subtle">
            <MapPin aria-hidden className="size-3" />
            {venueLocation}
          </span>
        )}

        {/* Award is distinct from the venue rank, so it remains a quiet note. */}
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

        {/* Abstract — a concise Markdown preview, not an essay in the list. */}
        {abstract && (
          <Markdown className="text-ds-sm leading-6 text-ds-fg-muted [&>div]:!my-0 [&>div]:line-clamp-3">
            {abstract}
          </Markdown>
        )}

        {/* Authors — owner emphasised. */}
        {authors && (
          <p className="text-ds-xs leading-5 text-ds-fg-subtle">
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
        {(url || pdfUrl || githubUrl || slidesUrl || blogUrl) && (
          <div className="mt-auto flex flex-wrap gap-2 pt-0.5">
            {url && <LinkPill href={url} icon={<FileText />} label="Paper" />}
            {pdfUrl && <LinkPill href={pdfUrl} icon={<FileText />} label="PDF" />}
            {githubUrl && <LinkPill href={githubUrl} icon={<Github />} label="Code" />}
            {slidesUrl && <LinkPill href={slidesUrl} icon={<FileText />} label="Slides" />}
            {blogUrl && <LinkPill href={blogUrl} icon={<Newspaper />} label="Blog" />}
          </div>
        )}
      </div>
    </motion.article>
  );
};

export default PublicationCard;
