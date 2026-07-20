// src/components/ds/dsAttr.ts
//
// Every design-system component must carry `data-ds` so the reset-
// reconciliation rules in design-system.css apply to it. index.css ships an
// aggressive legacy reset (`border:none !important`, `outline:none !important`,
// transparent input backgrounds) for the old "no borders, no surfaces" look;
// `[data-ds]` opts a subtree out of it — borders, input fills and focus rings
// are restored, and Tailwind `border` / `border-ds-*` utilities work normally.
//
// Spread onto the rendered root element:  <button {...dsRoot} … />
export const dsRoot = { 'data-ds': '' } as const;
