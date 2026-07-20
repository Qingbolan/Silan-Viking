// BlogStack TableOfContents — the in-article outline sidebar.
//
// This is a thin adapter onto the design-system `ds/TableOfContents`: it
// keeps the BlogStack `sections: Section[]` prop (so `ArticleDetailLayout` /
// `SeriesDetailLayout` call it unchanged) and adds the scroll container a
// long outline needs, then delegates the actual rendering — depth ramp,
// active rail, scroll-spy — to the DS component.
//
// It replaces the old antd `Anchor` implementation, whose flat indent and
// truncated rows did not convey heading depth.
import React from 'react';
import {
  TableOfContents as DsTableOfContents,
  type TocItem,
} from '../../ds/TableOfContents';
import { Section } from '../types/blog';

interface TableOfContentsProps {
  sections: Section[];
  className?: string;
}

/** Strip residual inline-markdown markers from a heading title.
 *  `useTOC` already removes the leading `#`s; a title may still carry
 *  `**bold**` / `` `code` `` / `_em_` markers that must not render literally
 *  in a plain-text outline row. */
const plainTitle = (title: string): string =>
  title
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  sections,
  className = '',
}) => {
  // `Section` ({ id, title, level }) is structurally `TocItem`; only the
  // title needs its inline markdown flattened.
  const items = React.useMemo<TocItem[]>(
    () =>
      sections.map((s) => ({
        id: s.id,
        title: plainTitle(s.title),
        level: s.level,
      })),
    [sections],
  );

  if (items.length === 0) return null;

  // The scroll container the DS component does not provide: a long article
  // outline must scroll within the sidebar, not push the page.
  return (
    <div
      className={`simple-toc ${className}`}
      style={{ position: 'relative', maxHeight: 'calc(100vh - 120px)' }}
    >
      <div
        style={{
          maxHeight: 'calc(100vh - 160px)',
          overflow: 'auto',
          paddingRight: '4px',
        }}
      >
        {/* `spy`: the DS component runs its own IntersectionObserver over the
            heading elements — the scroll-tracking the old antd Anchor did.
            `hideHeader`: the layout's collapse toggle already labels this
            section "Outline" — the DS component must not draw a second one. */}
        <DsTableOfContents items={items} spy hideHeader />
      </div>
    </div>
  );
};
