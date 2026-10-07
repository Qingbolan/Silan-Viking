import { parseSidebarOverrides, type SidebarOverrides, type SidebarStyle } from './SidebarAppearance';

/** Shared by the real sidebar and settings preview; all interpolated values are validated. */
export function sidebarSurface(style: SidebarStyle): string {
  return style.image
    ? `linear-gradient(${style.background}${Math.round(style.imageOverlay * 2.55).toString(16).padStart(2, '0')}, ${style.background}${Math.round(style.imageOverlay * 2.55).toString(16).padStart(2, '0')}), url("${style.image}")`
    : style.background;
}

export function sidebarProjection(input: SidebarOverrides): string {
  return Object.entries(parseSidebarOverrides(input)).map(([target, s]) => {
    const root = target === 'editor' ? ':root .content-part-rail' : ':root .sidebar';
    const row = target === 'editor' ? '.content-tree-row' : '.entity-button';
    return `
${root} {
  --editor-rail-fg: ${s.foreground}; --editor-rail-fg-strong: ${s.foreground};
  --editor-rail-fg-muted: ${s.muted}; --editor-rail-border: ${s.border};
  --editor-rail-surface-raised: ${s.card}; --editor-rail-surface-hover: ${s.hover};
  --workspace-sidebar-divider: ${s.border};
  background: ${sidebarSurface(s)}; background-size: ${s.imageFit};
  background-position: ${s.imagePosition}; background-repeat: no-repeat;
  color: ${s.foreground}; border-right: ${s.borderWidth}px solid ${s.border};
}
${root} ${row} {
  color: ${s.foreground}; border-radius: ${s.radius}px;
  font-size: ${s.fontSize}px; padding-top: ${s.padding}px; padding-bottom: ${s.padding}px; height: auto;
}
${root} ${row} > span { font-size: inherit; }
${root} ${row}:hover { background: ${s.hover}; color: ${s.foreground}; }
${root} ${row}.active { background: ${s.selected}; color: ${s.selectedForeground}; box-shadow: none; }
${root} .entity-button-icon { color: inherit; }
${root} .content-sidebar-review, ${root} .content-sidebar-sync { border-top: ${s.borderWidth}px solid ${s.border}; }
${root} .content-sidebar-review > div, ${root} .content-sidebar-review small { color: ${s.muted}; }
${root} .content-sidebar-review > button {
  background: ${s.card}; color: ${s.foreground}; border: ${s.borderWidth}px solid ${s.border}; border-radius: ${s.radius}px;
}
${root} .content-sidebar-review > button:hover { background: ${s.hover}; }
${root} .sidebar-workspace-switcher select { color: ${s.foreground}; }
`;
  }).join('\n');
}
