// src/components/ds/NoiseBackground.tsx
//
// Design-system background layer — an organic, diffusion-style colour field
// with a Gaussian-noise grain. Drop it as the first child of a positioned
// container; it fills the parent and sits at z-0 (lift siblings to z-10).
//
//   <div className="relative">
//     <NoiseBackground glow="nus-duo" />
//     <main className="relative z-10">…</main>
//   </div>
//
// The glow is NOT a clean radial gradient. Several offset, differently-sized
// elliptical blobs are stacked, then the whole field is pushed through an SVG
// turbulence-displacement filter (`feDisplacementMap` driven by fractal
// `feTurbulence`) so the edges break up and bleed like ink diffusing in
// water — closer to how a diffusion model paints soft light than a hard
// circle. The grain is a second fractal-noise pass blurred to a fine grain.
import React from 'react';
import { cn } from '../../lib/utils';

/* --- Gaussian-noise grain tile ------------------------------------------- */

const NOISE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">
     <filter id="g">
       <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="3" seed="11" stitchTiles="stitch"/>
       <feGaussianBlur stdDeviation="0.4"/>
       <feColorMatrix type="saturate" values="0"/>
     </filter>
     <rect width="100%" height="100%" filter="url(#g)"/>
   </svg>`.replace(/\s+/g, ' '),
);

export interface NoiseBackgroundProps {
  /** Grain opacity, 0–1. Keep low — this is texture, not pattern. */
  intensity?: number;
  /**
   * Colour field:
   *  - 'none'    — grain only, no colour
   *  - 'nus'     — NUS-orange diffusion field
   *  - 'nus-duo' — NUS orange + NUS blue, diffusing from opposite corners
   */
  glow?: 'none' | 'nus' | 'nus-duo';
  /** Render fixed to the viewport instead of filling the parent. */
  fixed?: boolean;
  className?: string;
}

/* --- Diffusion glow ------------------------------------------------------
   Each "blob" is a soft radial paint. Stacking several at offset positions
   with different radii gives an irregular, organic mass; the turbulence
   displacement filter then frays the edges so nothing reads as a circle. */

interface Blob {
  /** centre x / y in % */
  x: number;
  y: number;
  /** radius in % of the larger viewport edge */
  r: number;
  /** which token colour: 'p' = primary (orange), 'a' = accent (blue) */
  c: 'p' | 'a';
  /** peak opacity 0–1 */
  o: number;
}

const blobSets: Record<'nus' | 'nus-duo', Blob[]> = {
  // Single-hue field — orange diffusing from the top-left, fading out.
  nus: [
    { x: 4, y: -6, r: 58, c: 'p', o: 0.55 },
    { x: 22, y: 14, r: 40, c: 'p', o: 0.34 },
    { x: -6, y: 40, r: 46, c: 'p', o: 0.22 },
    { x: 104, y: 96, r: 50, c: 'p', o: 0.18 },
  ],
  // Two-hue field — orange top-left, blue bottom-right, meeting mid-field.
  'nus-duo': [
    { x: 2, y: -8, r: 56, c: 'p', o: 0.6 },
    { x: 26, y: 10, r: 38, c: 'p', o: 0.34 },
    { x: -4, y: 34, r: 44, c: 'p', o: 0.2 },
    { x: 100, y: 104, r: 56, c: 'a', o: 0.52 },
    { x: 74, y: 88, r: 38, c: 'a', o: 0.32 },
    { x: 108, y: 60, r: 44, c: 'a', o: 0.2 },
  ],
};

function blobBackground(blobs: Blob[]): string {
  // Each blob → one radial-gradient layer. color-mix lets the token colour
  // carry its own alpha so themes (light/dark) stay correct.
  return blobs
    .map((b) => {
      const tok = b.c === 'p' ? '--ds-color-primary' : '--ds-color-accent';
      const pct = Math.round(b.o * 100);
      return (
        `radial-gradient(${b.r}% ${b.r * 0.82}% at ${b.x}% ${b.y}%, ` +
        `color-mix(in oklch, var(${tok}) ${pct}%, transparent) 0%, ` +
        `transparent 70%)`
      );
    })
    .join(', ');
}

export const NoiseBackground: React.FC<NoiseBackgroundProps> = ({
  intensity = 0.05,
  glow = 'nus',
  fixed = false,
  className,
}) => {
  // A stable id so multiple instances don't share one SVG filter.
  const filterId = React.useId().replace(/:/g, '');

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none overflow-hidden',
        fixed ? 'fixed' : 'absolute',
        // z-0, never negative: a negative z-index would drop behind the
        // parent's own background-color. Lift siblings to `relative z-10`.
        'inset-0 z-0',
        className,
      )}
    >
      {glow !== 'none' && (
        <>
          {/* The turbulence-displacement filter that frays the blob edges. */}
          <svg className="absolute h-0 w-0" aria-hidden>
            <filter id={filterId}>
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.012 0.016"
                numOctaves={2}
                seed={9}
                result="turb"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="turb"
                scale={140}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </svg>

          {/* The diffusion colour field — stacked blobs, edges displaced. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: blobBackground(blobSets[glow]),
              filter: `url(#${filterId}) blur(8px)`,
              // The displacement can push paint past the edges; scale up a
              // touch and recentre so no hard seam shows.
              transform: 'scale(1.15)',
            }}
          />
        </>
      )}

      {/* Gaussian-noise grain — fine, blended over the colour field. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,${NOISE_SVG}")`,
          backgroundSize: '220px 220px',
          opacity: intensity,
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
};
