import type { ThemeDefinition } from './ThemeDefinition';

export type SidebarTarget = 'editor' | 'workspace';
export type SidebarStyle = Readonly<{
  background: string; foreground: string; muted: string; selected: string;
  selectedForeground: string; hover: string; border: string; card: string;
  radius: number; fontSize: number; padding: number; borderWidth: number;
  image: string | null; imageFit: 'cover' | 'contain'; imagePosition: 'center' | 'top' | 'bottom';
  imageOverlay: number;
}>;
export type SidebarOverrides = Readonly<Partial<Record<SidebarTarget, SidebarStyle>>>;
export const sidebarColors = {
  background: 'Background', foreground: 'Text', muted: 'Secondary text',
  selected: 'Selected row', selectedForeground: 'Selected text', hover: 'Hover',
  border: 'Borders', card: 'Review cards',
} as const;
export const sidebarDimensions = {
  radius: { label: 'Corner radius', min: 0, max: 24 },
  fontSize: { label: 'Text size', min: 10, max: 22 },
  padding: { label: 'Row spacing', min: 4, max: 20 },
  borderWidth: { label: 'Border width', min: 0, max: 4 },
  imageOverlay: { label: 'Image shading', min: 0, max: 100 },
} as const;
export const MAX_SIDEBAR_IMAGE_BYTES = 1024 * 1024;

function color(value: string | undefined, fallback: string): string {
  if (value && /^#[\da-f]{6}$/i.test(value)) return value;
  if (value && /^#[\da-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(c => c + c).join('');
  const rgb = value?.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  return rgb ? '#' + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('') : fallback;
}

export function sidebarDefaults(theme: ThemeDefinition, target: SidebarTarget): SidebarStyle {
  const t = theme.tokens;
  return Object.freeze({
    background: color(t[target === 'editor' ? '--component-content-part-rail-background' : '--component-desktop-titlebar-enabled-workspace-sidebar-surface'], '#2e3032'),
    foreground: color(t[target === 'editor' ? '--editor-rail-fg' : '--component-entity-button-color'], '#bdbdbd'), muted: color(t['--editor-rail-fg-muted'], '#999999'),
    selected: color(t[target === 'editor' ? '--editor-rail-surface-hover' : '--component-entity-button-active-background'], '#59492f'),
    selectedForeground: color(t[target === 'editor' ? '--editor-rail-fg-strong' : '--component-entity-button-active-color'], '#ffffff'),
    hover: color(t['--editor-rail-surface-hover'], '#393b3e'), border: color(t['--editor-rail-border'], '#484848'),
    card: color(t['--editor-rail-surface-raised'], '#111111'),
    radius: 6, fontSize: 13, padding: 8, borderWidth: 1,
    image: null, imageFit: 'cover', imagePosition: 'center', imageOverlay: 35,
  });
}

export function validateSidebarImage(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_SIDEBAR_IMAGE_BYTES / 3) * 4 + 40) throw new Error('Choose a background image smaller than 1 MB.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('Backgrounds must be PNG, JPEG or WebP images.');
  const bytes = atob(match[2]);
  const valid = match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n')
    : match[1] === 'jpeg' ? bytes.startsWith('\xff\xd8\xff')
    : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  if (!valid || bytes.length > MAX_SIDEBAR_IMAGE_BYTES) throw new Error('Invalid background image.');
  return value;
}

export function parseSidebarStyle(value: unknown): SidebarStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid sidebar style');
  const data = value as Record<string, unknown>;
  const keys = [...Object.keys(sidebarColors), ...Object.keys(sidebarDimensions), 'image', 'imageFit', 'imagePosition'];
  if (Object.keys(data).length !== keys.length || Object.keys(data).some(key => !keys.includes(key))) throw new Error('Invalid sidebar style fields');
  for (const key of Object.keys(sidebarColors)) {
    if (typeof data[key] !== 'string' || !/^#[\da-f]{6}$/i.test(data[key] as string)) throw new Error(`Invalid sidebar color: ${key}`);
  }
  for (const [key, range] of Object.entries(sidebarDimensions)) {
    const number = data[key];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < range.min || number > range.max) throw new Error(`Invalid sidebar setting: ${key}`);
  }
  if (!['cover', 'contain'].includes(String(data.imageFit)) || !['center', 'top', 'bottom'].includes(String(data.imagePosition))) throw new Error('Invalid background placement');
  validateSidebarImage(data.image);
  return Object.freeze({ ...data }) as SidebarStyle;
}

export function parseSidebarOverrides(value: unknown): SidebarOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid sidebar preferences');
  const parsed: Partial<Record<SidebarTarget, SidebarStyle>> = {};
  for (const [target, style] of Object.entries(value)) {
    if (target !== 'editor' && target !== 'workspace') throw new Error('Unknown sidebar');
    parsed[target] = parseSidebarStyle(style);
  }
  return Object.freeze(parsed);
}
