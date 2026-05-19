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

interface ContentPartsProps {
  parts: ContentPart[];
  /** Preferred language; falls back to a Part's canonical language. */
  className?: string;
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

const ContentParts: React.FC<ContentPartsProps> = ({ parts, className }) => {
  const { language } = useLanguage();

  // Only Parts with content become tabs, kept in SCHEMA `sortOrder`.
  const visible = useMemo(
    () =>
      [...(parts || [])]
        .filter((p) => partHasContent(p, language))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [parts, language],
  );

  const [active, setActive] = useState<string>(visible[0]?.role ?? '');

  // The active Part may vanish on a language switch — fall back to the first.
  const activePart =
    visible.find((p) => p.role === active) ?? visible[0] ?? null;

  if (visible.length === 0) {
    return (
      <p className={`text-theme-secondary ${className || ''}`}>
        {language === 'en' ? 'No content yet.' : '暂无内容。'}
      </p>
    );
  }

  return (
    <div className={className}>
      <Tabs
        appearance="vertical"
        value={activePart?.role}
        onChange={setActive}
        items={visible.map((p) => ({
          value: p.role,
          label: roleLabel(p.role, language),
          icon: ROLE_ICONS[p.role] ?? <ListTree size={16} />,
        }))}
      />
      <div className="mt-4">
        {activePart && activePart.shape === 'entry_list' ? (
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
      </div>
    </div>
  );
};

export default ContentParts;
