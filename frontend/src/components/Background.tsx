import React from 'react';
import { useTheme } from './ThemeContext';

// Fractal-noise paper grain — ported from EasyNet's gallery "paper" texture.
// A fixed, tiled SVG turbulence layer that reads as a fine wall/paper crease.
const PAPER_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E\")";

// Modern minimal academic background: a calm flat reading surface with a
// barely-there paper grain on top. No animated veil — texture + typography
// carry the page.
const Background: React.FC = () => {
  const { colors, isDarkMode } = useTheme();

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 transition-colors duration-300 w-full h-full"
      style={{ backgroundColor: colors.background }}
    >
      {/* Paper-grain overlay (EasyNet "paper" texture) */}
      <div
        aria-hidden
        className="absolute inset-0 w-full h-full"
        style={{
          backgroundImage: PAPER_TEXTURE,
          backgroundSize: '220px 220px',
          backgroundRepeat: 'repeat',
          mixBlendMode: isDarkMode ? 'soft-light' : 'multiply',
          opacity: isDarkMode ? 0.1 : 0.065,
        }}
      />
    </div>
  );
};

export default Background;
