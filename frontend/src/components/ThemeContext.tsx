import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

// Modern academic color scheme — Fluent skeleton, academic restraint.
// OKLCH tokens, "Paper white" + "Graphite" presets. Neutrals are chroma 0
// so surfaces stay true grey; a restrained ink-blue accent is reserved for
// links, the current item, and key actions. No AI-gradient look.
//
// Unlike the old scheme, surfaces are now LIGHTLY ELEVATED (not flat
// transparent): the design system expresses depth through stacked surface
// layers (surface-1..3) + hairline borders + faint honest shadows. The
// extra `ds*` tokens below are consumed by the new design-system components
// (Button/Card/Badge/...) and the /gallery page; the legacy fields are kept
// unchanged so existing components keep working until they are migrated.
const colorSchemes = {
  light: {
    // Primary — academic ink blue, used sparingly for emphasis
    primary: 'oklch(0.50 0.13 264)',
    primaryHover: 'oklch(0.44 0.14 264)',
    primaryLight: 'oklch(0.96 0.02 264)',   // faint wash for selected states

    // Secondary — true neutral graphite
    secondary: 'oklch(0.44 0 0)',
    secondaryHover: 'oklch(0.32 0 0)',
    secondaryLight: 'oklch(0.95 0 0)',

    // Background — Gallery "Paper white": flat, quiet
    background: 'oklch(1.00 0 0)',
    backgroundSecondary: 'oklch(0.965 0 0)',
    backgroundTertiary: 'oklch(0.94 0 0)',

    // Text — graphite ink on paper
    textPrimary: 'oklch(0.12 0 0)',
    textSecondary: 'oklch(0.50 0 0)',       // = gallery --muted-foreground
    textTertiary: 'oklch(0.62 0 0)',

    // Accent — same ink blue
    accent: 'oklch(0.50 0.13 264)',
    accentHover: 'oklch(0.44 0.14 264)',

    // Status
    success: 'oklch(0.55 0.13 150)',
    warning: 'oklch(0.62 0.13 70)',
    error: 'oklch(0.55 0.20 25)',

    // "Gradients" kept flat (solid) — no AI-gradient look
    gradientPrimary: 'oklch(0.50 0.13 264)',
    gradientSecondary: 'oklch(0.44 0 0)',
    gradientAccent: 'oklch(0.50 0.13 264)',

    // Legacy surface fields — kept transparent for un-migrated components.
    cardBackground: 'transparent',
    cardBorder: 'transparent',
    surface: 'transparent',
    surfaceSecondary: 'transparent',
    surfaceTertiary: 'transparent',
    surfaceElevated: 'transparent',

    // Interactive states — kept faint so hover/active still gives feedback
    hoverBackground: 'oklch(0.96 0 0)',
    activeBackground: 'oklch(0.93 0 0)',
    focusRing: 'oklch(0.50 0.13 264)',

    // Legacy shadow fields — still off for un-migrated components.
    shadowSm: 'none',
    shadowMd: 'none',
    shadowLg: 'none',
    shadowXl: 'none',

    // --- Design-system tokens (--ds-color-*) -------------------------------
    // NUS brand palette: NUS Orange #EF7C00 (primary) + NUS Blue #003D7C
    // (accent). Surfaces stay true-neutral; the brand colours are used
    // sparingly — macOS-style restraint, not a wash of colour.
    dsCanvas: 'oklch(0.985 0 0)',          // page background
    dsSurface1: 'oklch(1.00 0 0)',         // resting card / panel
    dsSurface2: 'oklch(0.975 0 0)',        // nested / inset surface
    dsSurface3: 'oklch(0.95 0 0)',         // deepest inset (code, wells)
    dsBorder: 'oklch(0.915 0 0)',          // hairline separator
    dsBorderStrong: 'oklch(0.84 0 0)',     // emphasized hairline
    dsOverlay: 'oklch(0.20 0 0 / 0.28)',   // modal scrim
    dsRing: 'oklch(0.70 0.176 52 / 0.40)', // focus ring (NUS orange)

    // Primary — NUS Orange #EF7C00
    dsPrimary: 'oklch(0.702 0.176 52)',
    dsPrimaryHover: 'oklch(0.652 0.178 50)',
    dsPrimaryActive: 'oklch(0.602 0.175 48)',
    dsPrimaryFg: 'oklch(1.00 0 0)',        // text on primary fill
    dsPrimarySoft: 'oklch(0.955 0.035 60)',

    // Accent — NUS Blue #003D7C
    dsAccent: 'oklch(0.362 0.118 256)',
    dsAccentHover: 'oklch(0.322 0.120 256)',
    dsAccentFg: 'oklch(1.00 0 0)',
    dsAccentSoft: 'oklch(0.95 0.03 256)',

    // Status soft washes
    dsSuccessSoft: 'oklch(0.95 0.04 150)',
    dsWarningSoft: 'oklch(0.95 0.05 75)',
    dsErrorSoft: 'oklch(0.95 0.04 25)',
  },
  dark: {
    // Primary — lighter ink blue for contrast on graphite
    primary: 'oklch(0.72 0.12 264)',
    primaryHover: 'oklch(0.80 0.12 264)',
    primaryLight: 'oklch(0.24 0.04 264)',

    // Secondary — neutral
    secondary: 'oklch(0.66 0 0)',
    secondaryHover: 'oklch(0.80 0 0)',
    secondaryLight: 'oklch(0.23 0 0)',

    // Background — "Graphite": a layered near-neutral with a faint ink-blue
    // cast, lifted enough that desk / window / surface read as distinct.
    background: 'oklch(0.165 0.010 264)',
    backgroundSecondary: 'oklch(0.21 0.012 264)',
    backgroundTertiary: 'oklch(0.26 0.014 264)',

    // Text
    textPrimary: 'oklch(0.96 0.003 260)',
    textSecondary: 'oklch(0.66 0.008 260)',
    textTertiary: 'oklch(0.52 0.008 260)',

    // Accent
    accent: 'oklch(0.72 0.12 264)',
    accentHover: 'oklch(0.80 0.12 264)',

    // Status
    success: 'oklch(0.72 0.15 150)',
    warning: 'oklch(0.80 0.14 80)',
    error: 'oklch(0.70 0.18 25)',

    // Flat solid
    gradientPrimary: 'oklch(0.72 0.12 264)',
    gradientSecondary: 'oklch(0.66 0 0)',
    gradientAccent: 'oklch(0.72 0.12 264)',

    // Legacy surface fields — kept transparent for un-migrated components.
    cardBackground: 'transparent',
    cardBorder: 'transparent',
    surface: 'transparent',
    surfaceSecondary: 'transparent',
    surfaceTertiary: 'transparent',
    surfaceElevated: 'transparent',

    // Interactive states
    hoverBackground: 'oklch(0.22 0.010 260)',
    activeBackground: 'oklch(0.26 0.012 260)',
    focusRing: 'oklch(0.72 0.12 264)',

    // Legacy shadow fields — still off for un-migrated components.
    shadowSm: 'none',
    shadowMd: 'none',
    shadowLg: 'none',
    shadowXl: 'none',

    // --- Design-system tokens (--ds-color-*) -------------------------------
    // NUS brand palette on graphite: orange lifts slightly for contrast,
    // blue lightens so it stays legible on the dark canvas.
    dsCanvas: 'oklch(0.165 0.006 264)',
    dsSurface1: 'oklch(0.205 0.007 264)',
    dsSurface2: 'oklch(0.245 0.008 264)',
    dsSurface3: 'oklch(0.285 0.009 264)',
    dsBorder: 'oklch(0.305 0.008 264)',
    dsBorderStrong: 'oklch(0.40 0.010 264)',
    dsOverlay: 'oklch(0.05 0 0 / 0.62)',
    dsRing: 'oklch(0.74 0.165 56 / 0.45)',

    // Primary — NUS Orange, lifted for dark contrast
    dsPrimary: 'oklch(0.745 0.165 56)',
    dsPrimaryHover: 'oklch(0.795 0.150 58)',
    dsPrimaryActive: 'oklch(0.695 0.170 54)',
    dsPrimaryFg: 'oklch(0.16 0.02 56)',
    dsPrimarySoft: 'oklch(0.30 0.055 56)',

    // Accent — NUS Blue, lightened
    dsAccent: 'oklch(0.68 0.115 256)',
    dsAccentHover: 'oklch(0.74 0.110 256)',
    dsAccentFg: 'oklch(0.16 0.02 256)',
    dsAccentSoft: 'oklch(0.29 0.055 256)',

    // Status soft washes
    dsSuccessSoft: 'oklch(0.27 0.05 150)',
    dsWarningSoft: 'oklch(0.29 0.06 75)',
    dsErrorSoft: 'oklch(0.28 0.06 25)',
  }
};

interface ColorScheme {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  secondary: string;
  secondaryHover: string;
  secondaryLight: string;
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentHover: string;
  success: string;
  warning: string;
  error: string;
  gradientPrimary: string;
  gradientSecondary: string;
  gradientAccent: string;
  cardBackground: string;
  cardBorder: string;
  surface: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  surfaceElevated: string;
  hoverBackground: string;
  activeBackground: string;
  focusRing: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  shadowXl: string;
  // Design-system tokens (NUS brand palette)
  dsCanvas: string;
  dsSurface1: string;
  dsSurface2: string;
  dsSurface3: string;
  dsBorder: string;
  dsBorderStrong: string;
  dsOverlay: string;
  dsRing: string;
  dsPrimary: string;
  dsPrimaryHover: string;
  dsPrimaryActive: string;
  dsPrimaryFg: string;
  dsPrimarySoft: string;
  dsAccent: string;
  dsAccentHover: string;
  dsAccentFg: string;
  dsAccentSoft: string;
  dsSuccessSoft: string;
  dsWarningSoft: string;
  dsErrorSoft: string;
}

interface ThemeContextType {
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  toggleTheme: () => void;
  colors: ColorScheme;
}

interface ThemeProviderProps {
  children: ReactNode;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    // Check saved preference first; default to light mode (academic convention)
    const savedMode = localStorage.getItem('darkMode');
    return savedMode !== null ? JSON.parse(savedMode) : false;
  });

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const colors = colorSchemes[isDarkMode ? 'dark' : 'light'];

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    
    // Apply theme class to document
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Apply CSS custom properties for dynamic theming.
    // Legacy fields → `--color-*`; design-system fields (ds*) → `--ds-color-*`
    // in kebab-case (e.g. dsSurface1 → --ds-color-surface-1), matching the
    // tokens consumed by design-system.css and the new UI components.
    const root = document.documentElement;
    const toKebab = (s: string) =>
      s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
      if (key.startsWith('ds')) {
        // dsSurface1 → surface-1 ; dsPrimaryFg → primary-fg
        const dsName = toKebab(key.slice(2));
        root.style.setProperty(`--ds-color-${dsName}`, value);
      }
    });

    // Apply shadow CSS custom properties
    root.style.setProperty('--shadow-sm', colors.shadowSm);
    root.style.setProperty('--shadow-md', colors.shadowMd);
    root.style.setProperty('--shadow-lg', colors.shadowLg);
    root.style.setProperty('--shadow-xl', colors.shadowXl);

    // Apply futuristic design properties
    root.style.setProperty('--border-radius-sm', '0.5rem');
    root.style.setProperty('--border-radius-md', '0.75rem');
    root.style.setProperty('--border-radius-lg', '1rem');
    root.style.setProperty('--border-radius-xl', '1.5rem');
    root.style.setProperty('--transition-fast', '0.15s ease-out');
    root.style.setProperty('--transition-smooth', '0.3s ease-out');
    root.style.setProperty('--backdrop-blur', 'blur(10px)');
    
  }, [isDarkMode, colors]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('darkMode')) {
        setIsDarkMode(e.matches);
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const contextValue: ThemeContextType = {
    isDarkMode,
    setIsDarkMode,
    toggleTheme,
    colors
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 