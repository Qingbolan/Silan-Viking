import type { EntityFilter } from '../../types';
import type { SidebarGlyphName } from './types';

export const glyphForItem = (item: EntityFilter): SidebarGlyphName => {
  switch (item) {
    case 'resume':
      return 'resume';
    case 'moment':
      return 'moment';
    case 'blog':
      return 'blog';
    case 'project':
      return 'project';
    default:
      return 'source';
  }
};

export function SidebarGlyph({
  name,
  size = 17,
}: {
  name: SidebarGlyphName;
  size?: number;
}) {
  return (
    <svg
      className="sidebar-glyph"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'dashboard' && (
        <>
          <rect x="3.25" y="3.25" width="5.25" height="5.25" rx="1" />
          <rect x="11.5" y="3.25" width="5.25" height="5.25" rx="1" />
          <rect x="3.25" y="11.5" width="5.25" height="5.25" rx="1" />
          <rect x="11.5" y="11.5" width="5.25" height="5.25" rx="1" />
        </>
      )}
      {name === 'resume' && (
        <>
          <circle cx="10" cy="6.25" r="2.75" />
          <path d="M4.5 16.5v-1.25A5.5 5.5 0 0 1 10 9.75a5.5 5.5 0 0 1 5.5 5.5v1.25" />
        </>
      )}
      {name === 'moment' && (
        <>
          <circle cx="10" cy="10" r="6.75" />
          <circle cx="10" cy="10" r="2.15" />
          <path d="M10 3.25v2.4M10 14.35v2.4M3.25 10h2.4M14.35 10h2.4" />
        </>
      )}
      {name === 'blog' && (
        <>
          <path d="M3.25 4.25h4.5A2.25 2.25 0 0 1 10 6.5v10.25a2.75 2.75 0 0 0-2.75-2.75h-4V4.25Z" />
          <path d="M16.75 4.25h-4.5A2.25 2.25 0 0 0 10 6.5v10.25A2.75 2.75 0 0 1 12.75 14h4V4.25Z" />
        </>
      )}
      {name === 'project' && (
        <>
          <path d="M3.25 6.5h13.5v9.25a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1V6.5Z" />
          <path d="M7 6.5V4.25a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V6.5M3.25 10.5h13.5" />
          <path d="M8.5 10.5v1.25h3V10.5" />
        </>
      )}
      {name === 'source' && (
        <>
          <path d="M5 2.75h6l4 4v10.5H5V2.75Z" />
          <path d="M11 2.75v4h4M7.5 10h5M7.5 13h5" />
        </>
      )}
      {name === 'settings' && (
        <>
          <circle cx="10" cy="10" r="2.5" />
          <path d="M8.8 2.75h2.4l.45 2a6 6 0 0 1 1.65.95l1.95-.6 1.2 2.08-1.5 1.4a6 6 0 0 1 0 1.9l1.5 1.4-1.2 2.08-1.95-.6a6 6 0 0 1-1.65.95l-.45 2H8.8l-.45-2a6 6 0 0 1-1.65-.95l-1.95.6-1.2-2.08 1.5-1.4a6 6 0 0 1 0-1.9l-1.5-1.4 1.2-2.08 1.95.6a6 6 0 0 1 1.65-.95l.45-2Z" />
        </>
      )}
    </svg>
  );
}

