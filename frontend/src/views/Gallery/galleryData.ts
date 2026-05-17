// src/views/Gallery/galleryData.ts
//
// Reference data for the /gallery design-system page: the token tables.
// Kept separate from the components so the spec values live in one place.

export interface TokenRow {
  name: string;
  value: string;
  usage: string;
}

export const radiusTokens: TokenRow[] = [
  { name: 'rounded-ds-xs', value: '2px', usage: 'Chips, dense controls' },
  { name: 'rounded-ds-sm', value: '4px', usage: 'Inputs, badges' },
  { name: 'rounded-ds-md', value: '6px', usage: 'Buttons — default control radius' },
  { name: 'rounded-ds-lg', value: '8px', usage: 'Cards, panels' },
  { name: 'rounded-ds-xl', value: '12px', usage: 'Modals, large surfaces' },
  { name: 'rounded-ds-2xl', value: '16px', usage: 'Hero / feature surfaces' },
];

export const elevationTokens: TokenRow[] = [
  { name: 'shadow-ds-1', value: 'faint', usage: 'Resting card' },
  { name: 'shadow-ds-2', value: 'low', usage: 'Hovered card, popover' },
  { name: 'shadow-ds-3', value: 'medium', usage: 'Lifted / dragged card' },
  { name: 'shadow-ds-4', value: 'high', usage: 'Modal, dropdown menu' },
];

export const durationTokens: TokenRow[] = [
  { name: 'duration-ds-instant', value: '67ms', usage: 'Hover tint, micro feedback' },
  { name: 'duration-ds-fast', value: '120ms', usage: 'Control state changes' },
  { name: 'duration-ds-normal', value: '180ms', usage: 'Surface transitions' },
  { name: 'duration-ds-slow', value: '260ms', usage: 'Entrances, layout shifts' },
  { name: 'duration-ds-slower', value: '400ms', usage: 'Page / modal choreography' },
];

export const easingTokens: TokenRow[] = [
  { name: 'ease-ds-standard', value: 'cubic-bezier(0.2, 0, 0, 1)', usage: 'Default — most transitions' },
  { name: 'ease-ds-emphasized', value: 'cubic-bezier(0.4, 0, 0.2, 1)', usage: 'Surfaces entering/leaving' },
  { name: 'ease-ds-decelerate', value: 'cubic-bezier(0, 0, 0.2, 1)', usage: 'Elements entering the screen' },
  { name: 'ease-ds-out-expo', value: 'cubic-bezier(0.16, 1, 0.3, 1)', usage: 'Long, smooth entrances' },
  { name: 'ease-ds-out-back', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', usage: 'Playful pop (modals, badges)' },
];

export const spacingTokens: TokenRow[] = [
  { name: 'space-1', value: '4px', usage: 'Icon ↔ label' },
  { name: 'space-2', value: '8px', usage: 'Tight grouping' },
  { name: 'space-3', value: '12px', usage: 'Related controls' },
  { name: 'space-4', value: '16px', usage: 'Default block gap' },
  { name: 'space-5', value: '24px', usage: 'Card padding, section sub-blocks' },
  { name: 'space-6', value: '32px', usage: 'Between distinct groups' },
  { name: 'space-7', value: '48px', usage: 'Section padding' },
  { name: 'space-8', value: '64px', usage: 'Major page divisions' },
];

export interface SwatchGroup {
  label: string;
  swatches: { name: string; varName: string; note?: string }[];
}

export const colorGroups: SwatchGroup[] = [
  {
    label: 'Surfaces',
    swatches: [
      { name: 'canvas', varName: '--ds-color-canvas', note: 'Page background' },
      { name: 'surface-1', varName: '--ds-color-surface-1', note: 'Resting card' },
      { name: 'surface-2', varName: '--ds-color-surface-2', note: 'Inset / nested' },
      { name: 'surface-3', varName: '--ds-color-surface-3', note: 'Deepest well' },
    ],
  },
  {
    label: 'Brand',
    swatches: [
      { name: 'primary', varName: '--ds-color-primary', note: 'NUS Orange #EF7C00' },
      { name: 'primary-soft', varName: '--ds-color-primary-soft', note: 'Orange wash' },
      { name: 'accent', varName: '--ds-color-accent', note: 'NUS Blue #003D7C' },
      { name: 'accent-soft', varName: '--ds-color-accent-soft', note: 'Blue wash' },
    ],
  },
  {
    label: 'Text & Status',
    swatches: [
      { name: 'fg', varName: '--color-textPrimary', note: 'Body text' },
      { name: 'fg-muted', varName: '--color-textSecondary', note: 'Secondary text' },
      { name: 'success', varName: '--color-success', note: 'Positive' },
      { name: 'error', varName: '--color-error', note: 'Destructive' },
    ],
  },
];

export interface SectionDef {
  id: string;
  label: string;
}

export const gallerySections: SectionDef[] = [
  { id: 'foundations', label: 'Foundations' },
  { id: 'materials', label: 'Materials' },
  { id: 'background', label: 'Background' },
  { id: 'chrome', label: 'Chrome & Icons' },
  { id: 'layout', label: 'Layout' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'cards', label: 'Cards' },
  { id: 'badges', label: 'Badges' },
  { id: 'forms', label: 'Forms' },
  { id: 'controls', label: 'Controls' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'data', label: 'Data Display' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'brand', label: 'Brand & States' },
];
