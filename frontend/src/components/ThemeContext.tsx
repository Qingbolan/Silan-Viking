import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

// Modern minimal academic color scheme — aligned to EasyNet's gallery
// design language (OKLCH tokens, "Paper white" + "Graphite" presets).
// Neutrals are chroma 0 so the surface stays true grey; a restrained
// academic ink-blue accent is reserved for links, the current item,
// and key actions. No gradients in the UI; separation is by surface
// layer + spacing, not borders.
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

    // Surfaces — fully transparent: no container backgrounds, no borders.
    // Separation is by spacing and typography alone.
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

    // Shadows — disabled globally; separation is by surface + spacing.
    shadowSm: 'none',
    shadowMd: 'none',
    shadowLg: 'none',
    shadowXl: 'none',
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

    // Surfaces — fully transparent: no container backgrounds, no borders.
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

    // Shadows — disabled globally; separation is by surface + spacing.
    shadowSm: 'none',
    shadowMd: 'none',
    shadowLg: 'none',
    shadowXl: 'none',
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
    
    // Apply CSS custom properties for dynamic theming
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
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