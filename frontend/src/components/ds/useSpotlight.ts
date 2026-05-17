// src/components/ds/useSpotlight.ts
//
// Tracks the cursor position over an element and writes it into the
// `--ds-mx` / `--ds-my` CSS custom properties (as percentages). The
// `.ds-spotlight` and `.ds-reveal` materials in design-system.css read
// these to position their cursor-following glow.
import React from 'react';

export function useSpotlight<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);

  const onMouseMove = React.useCallback((e: React.MouseEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--ds-mx', `${x}%`);
    el.style.setProperty('--ds-my', `${y}%`);
  }, []);

  return { ref, onMouseMove };
}
