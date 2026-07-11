// ContentParts — the data-driven Part renderer.
//
// A content Item (idea / project / …) carries a list of Parts. The
// silan-viking SCHEMA `parts` set is a *recommendation*, not a closed
// whitelist: an Item may carry a Part whose `role` no type predeclares — an
// agent can grow a `benchmark` or `roadmap` section without a SCHEMA or UI
// change. This component renders one tab per Part the Item actually has, in
// `sortOrder`, with no hardcoded role list. A `prose` Part shows its
// markdown body; an `entry_list` Part shows its entries.
import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Target,
  AlertTriangle,
  Lightbulb,
  GraduationCap,
  Rocket,
  Tag,
  FileText,
  BarChart3,
  CheckCircle,
  ListTree,
} from 'lucide-react';
import { Tabs } from '../ds';
import Markdown from '../ui/Markdown';
import { useLanguage } from '../LanguageContext';
import type { ContentPart, ContentEntry } from '../../types';

/**
 * A registered, fixed tab — a runtime feature (community feedback, issues)
 * that is *not* a content Part. Unlike Part tabs, these are declared by the
 * caller, not data-driven: they are always present, in the order given, and
 * sit after the content Parts. The open-set model governs only Part tabs.
 */
export interface ExtraTab {
  /** Stable key — also the tab's controlled value. */
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** The panel rendered when this tab is active. */
  render: () => React.ReactNode;
}

interface ContentPartsProps {
  parts: ContentPart[];
  /**
   * Fixed runtime tabs appended after the content Parts (community, issues).
   * Declared, not data-driven — always shown, never extended by an agent.
   */
  extraTabs?: ExtraTab[];
  className?: string;
  /** Controlled mode — caller decides which tab is active. */
  value?: string;
  /** Notify caller of tab changes (works for both controlled & uncontrolled). */
  onValueChange?: (value: string) => void;
  /**
   * `tabs` (default) — left-rail vertical nav + single Part on the right.
   * `long`            — render every content Part stacked into a long page;
   *                     each Part gets an id={role} anchor so a sidebar nav
   *                     can scroll to it. ExtraTabs (e.g. Discussion) still
   *                     render at the bottom under a heading. Used by the
   *                     KnowledgeBaseShell layout.
   */
  layout?: 'tabs' | 'long';
  /**
   * Hide the internal vertical tab nav — when the caller already has its own
   * chapter nav (e.g. KnowledgeBaseShell.BookNav) and just wants the content
   * pane. Behaves like `tabs` for everything else.
   */
  hideNav?: boolean;
}

/** Known roles get a curated icon; an unknown role falls back to a generic. */
const ROLE_ICONS: Record<string, React.ReactNode> = {
  overview: <BookOpen size={16} />,
  abstract: <FileText size={16} />,
  goals: <Target size={16} />,
  challenges: <AlertTriangle size={16} />,
  solutions: <Lightbulb size={16} />,
  lessons: <GraduationCap size={16} />,
  quick_start: <Rocket size={16} />,
  release_notes: <Tag size={16} />,
  progress: <BarChart3 size={16} />,
  result: <CheckCircle size={16} />,
  reference: <BookOpen size={16} />,
};

/** Known roles get a translated label; an unknown role is title-cased. */
const ROLE_LABELS: Record<string, { en: string; zh: string }> = {
  overview: { en: 'Overview', zh: '概述' },
  abstract: { en: 'Abstract', zh: '摘要' },
  goals: { en: 'Goals', zh: '目标' },
  challenges: { en: 'Challenges', zh: '挑战' },
  solutions: { en: 'Solutions', zh: '解决方案' },
  lessons: { en: 'Lessons', zh: '经验总结' },
  quick_start: { en: 'Quick Start', zh: '快速开始' },
  release_notes: { en: 'Release Notes', zh: '发布说明' },
  progress: { en: 'Latest Progress', zh: '最新进展' },
  result: { en: 'Results', zh: '结果' },
  reference: { en: 'References', zh: '参考文献' },
};

/** Title-case an arbitrary role (`related_work` -> `Related Work`). */
function humanizeRole(role: string): string {
  return role
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function roleLabel(role: string, language: string): string {
  const known = ROLE_LABELS[role];
  if (known) return language === 'en' ? known.en : known.zh;
  return humanizeRole(role);
}

/** Pick a Part's body in the preferred language, falling back honestly. */
function partBody(part: ContentPart, language: string): string {
  return (
    part.body?.[language] ||
    part.body?.[part.canonicalLang] ||
    part.body?.en ||
    Object.values(part.body || {})[0] ||
    ''
  );
}

/** A Part is worth a tab if it has prose or at least one entry. */
function partHasContent(part: ContentPart, language: string): boolean {
  if (part.shape === 'entry_list') return (part.entries?.length ?? 0) > 0;
  return partBody(part, language).trim().length > 0;
}

/** Render a single entry of an `entry_list` Part as a labelled card. */
const EntryCard: React.FC<{ entry: ContentEntry }> = ({ entry }) => {
  // An entry's fields are an open payload — `entry_list` Parts carry
  // type-specific shapes (a work entry, a publication). Render every
  // string-ish field as a key/value row rather than assume a schema.
  const fields = { ...entry.sharedPayload, ...entry.localizedPayload };
  const rows = Object.entries(fields).filter(
    ([, v]) => v != null && v !== '' && typeof v !== 'object',
  );
  return (
    <div className="rounded-lg border border-theme-border bg-theme-surface p-4">
      {rows.map(([key, value]) => (
        <div key={key} className="flex gap-2 text-sm py-0.5">
          <span className="text-theme-secondary capitalize min-w-[7rem]">
            {humanizeRole(key)}
          </span>
          <span className="text-theme-primary">{String(value)}</span>
        </div>
      ))}
    </div>
  );
};

/** Extra-tab values are namespaced so a runtime tab never collides with a
 *  Part `role` (a project could legitimately have a `community` Part). */
const EXTRA_PREFIX = 'tab:';

const ContentParts: React.FC<ContentPartsProps> = ({
  parts,
  extraTabs = [],
  className,
  value,
  onValueChange,
  layout = 'tabs',
  hideNav = false,
}) => {
  const { language } = useLanguage();

  // Only Parts with content become tabs, kept in SCHEMA `sortOrder`.
  const visible = useMemo(
    () =>
      [...(parts || [])]
        .filter((p) => partHasContent(p, language))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [parts, language],
  );

  // The full tab strip: data-driven content Parts first, then the fixed
  // runtime tabs. Runtime tabs are *registered* (declared by the caller),
  // never extended by an agent — the open-set model governs Parts only.
  const tabItems = [
    ...visible.map((p) => ({
      value: p.role,
      label: roleLabel(p.role, language),
      icon: ROLE_ICONS[p.role] ?? <ListTree size={16} />,
    })),
    ...extraTabs.map((t) => ({
      value: EXTRA_PREFIX + t.key,
      label: t.label,
      icon: t.icon,
    })),
  ];

  const [internal, setInternal] = useState<string>(tabItems[0]?.value ?? '');
  const active = value ?? internal;
  const setActive = (v: string) => {
    if (value === undefined) setInternal(v);
    onValueChange?.(v);
  };

  // The active value may vanish on a language switch — fall back to the
  // first tab. It resolves to either a content Part or a runtime tab.
  const activeValue = tabItems.some((t) => t.value === active)
    ? active
    : (tabItems[0]?.value ?? '');
  const activePart = visible.find((p) => p.role === activeValue) ?? null;
  const activeExtra = activeValue.startsWith(EXTRA_PREFIX)
    ? extraTabs.find((t) => EXTRA_PREFIX + t.key === activeValue)
    : undefined;

  if (tabItems.length === 0) {
    return (
      <p className={`text-theme-secondary ${className || ''}`}>
        {language === 'en' ? 'No content yet.' : '暂无内容。'}
      </p>
    );
  }

  // Long-form layout — every Part stacked top-to-bottom, each in its own
  // <section id={role}> so a sidebar nav can anchor-link. Extra tabs render
  // under their own heading at the bottom (e.g. Discussion). The role name
  // is shown as a section header so the reader knows where they are.
  if (layout === 'long') {
    return (
      <div className={`space-y-12 ${className || ''}`}>
        {visible.map((p) => (
          <section key={p.role} id={p.role} className="scroll-mt-24">
            <h2 className="mb-4 inline-flex items-center gap-2 text-ds-xl font-semibold tracking-[-0.01em] text-ds-fg">
              <span className="text-ds-fg-subtle [&_svg]:size-[18px]">
                {ROLE_ICONS[p.role] ?? <ListTree size={16} />}
              </span>
              {roleLabel(p.role, language)}
            </h2>
            {p.shape === 'entry_list' ? (
              <div className="space-y-3">
                {[...p.entries]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((e) => (
                    <EntryCard key={e.id} entry={e} />
                  ))}
              </div>
            ) : (
              <Markdown>{partBody(p, language)}</Markdown>
            )}
          </section>
        ))}
        {extraTabs.map((t) => (
          <section key={t.key} id={`tab-${t.key}`} className="scroll-mt-24">
            <h2 className="mb-4 inline-flex items-center gap-2 text-ds-xl font-semibold tracking-[-0.01em] text-ds-fg">
              <span className="text-ds-fg-subtle [&_svg]:size-[18px]">
                {t.icon}
              </span>
              {t.label}
            </h2>
            {t.render()}
          </section>
        ))}
      </div>
    );
  }

  // The body for the currently-active Part / extra tab. Wrapped in
  // <article id="kb-active-part"> so external nav (BookNav sub-headings,
  // DOMOutline) can scope their DOM scans to "what is currently shown".
  const body = (
    <article id="kb-active-part" className="min-w-0">
      {activeExtra ? (
        activeExtra.render()
      ) : activePart && activePart.shape === 'entry_list' ? (
        <div className="space-y-3">
          {[...activePart.entries]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
        </div>
      ) : activePart ? (
        <Markdown>{partBody(activePart, language)}</Markdown>
      ) : null}
    </article>
  );

  if (hideNav) {
    return <div className={className}>{body}</div>;
  }

  return (
    // Two-column docs layout — a left-rail vertical nav and the content
    // panel beside it. On a narrow viewport the rail stacks above.
    <div className={`flex w-full flex-col gap-6 md:flex-row md:gap-8 ${className || ''}`}>
      <nav className="shrink-0 md:w-56">
        <div className="md:sticky md:top-16">
          <Tabs
            appearance="vertical"
            value={activeValue}
            onChange={setActive}
            items={tabItems}
          />
        </div>
      </nav>
      <div className="flex-1">{body}</div>
    </div>
  );
};

export default ContentParts;
