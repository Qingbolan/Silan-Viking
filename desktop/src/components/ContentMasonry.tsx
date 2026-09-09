import { useMemo, type ReactNode } from 'react';
import { measuredCell, useMasonry } from '@masonrykit/react';
import type { ContentGroup } from '../types';

interface ContentMasonryProps {
  groups: ContentGroup[];
  renderCard: (group: ContentGroup) => ReactNode;
}

/** Uses the public site's measured shortest-column engine; card geometry is
 * remeasured when covers, management controls, or the workspace width change. */
export function ContentMasonry({ groups, renderCard }: ContentMasonryProps) {
  const cells = useMemo(() => groups.map((group) => measuredCell(group.id, {
    columnSpan: group.cardKind === 'series' ? 2 : 1,
    estimatedHeight: 360,
    meta: group,
  })), [groups]);
  const { layout, stableCells, gridRef, cellRef } = useMasonry<ContentGroup>(cells, {
    columnWidth: 300,
    gap: 14,
  });
  const ready = layout.width > 0;

  return (
    <div
      className="content-masonry"
      ref={gridRef}
      role="list"
      data-masonry-columns={layout.columns.count}
      style={ready ? { height: layout.height } : undefined}
    >
      {stableCells.map((cell) => (
        <div
          key={cell.id}
          ref={cellRef(cell.id)}
          role="listitem"
          data-masonry-cell={cell.id}
          className="content-masonry-cell"
          style={ready ? {
            position: 'absolute',
            width: cell.width,
            left: cell.x,
            top: cell.y,
          } : undefined}
        >
          {renderCard(cell.meta as ContentGroup)}
        </div>
      ))}
    </div>
  );
}
