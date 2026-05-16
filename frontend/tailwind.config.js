/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    screens: {
      'xs': '360px',     // Better support for small phones
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      // Typography
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'display': ['Poppins', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Monaco', 'Consolas', 'monospace'],
      },
      
      // Theme-aware colors using CSS custom properties
      colors: {
        // Theme-aware dynamic colors
        theme: {
          primary: 'var(--color-primary)',
          'primary-hover': 'var(--color-primaryHover)',
          'primary-light': 'var(--color-primaryLight)',
          secondary: 'var(--color-secondary)',
          'secondary-hover': 'var(--color-secondaryHover)',
          'secondary-light': 'var(--color-secondaryLight)',
          accent: 'var(--color-accent)',
          'accent-hover': 'var(--color-accentHover)',
          
          // Background colors
          background: 'var(--color-background)',
          'background-secondary': 'var(--color-backgroundSecondary)',
          'background-tertiary': 'var(--color-backgroundTertiary)',
          
          // Text colors
          'text-primary': 'var(--color-textPrimary)',
          'text-secondary': 'var(--color-textSecondary)',
          'text-tertiary': 'var(--color-textTertiary)',
          
          // Surface colors
          'card-background': 'var(--color-cardBackground)',
          'card-border': 'var(--color-cardBorder)',
          surface: 'var(--color-surface)',
          'surface-secondary': 'var(--color-surfaceSecondary)',
          'surface-tertiary': 'var(--color-surfaceTertiary)',
          'surface-elevated': 'var(--color-surfaceElevated)',
          
          // Interactive states
          'hover-background': 'var(--color-hoverBackground)',
          'active-background': 'var(--color-activeBackground)',
          'focus-ring': 'var(--color-focusRing)',
          
          // Status colors
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          error: 'var(--color-error)',
        },
        
        // Static color palette - Professional and Clean
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        secondary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        neutral: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        error: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
      },

      // Spacing Scale
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      // Animation and Transitions
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },

      // Typography Scale - Optimized for iPhone SE and small screens
      fontSize: {
        // Mobile-first approach with better scaling
        'xs': ['0.75rem', { lineHeight: '1rem' }],        // 12px - Smaller text
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],    // 14px - Small but readable
        'base': ['1rem', { lineHeight: '1.5rem' }],       // 16px - Standard base
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],    // 18px 
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],     // 20px
        '2xl': ['1.5rem', { lineHeight: '2rem' }],        // 24px
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],   // 30px
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],     // 36px
        '5xl': ['3rem', { lineHeight: '1' }],             // 48px
        '6xl': ['3.75rem', { lineHeight: '1' }],          // 60px
        '7xl': ['4.5rem', { lineHeight: '1' }],           // 72px
        '8xl': ['6rem', { lineHeight: '1' }],             // 96px
        '9xl': ['8rem', { lineHeight: '1' }],             // 128px
        
        // Mobile-specific sizes for iPhone SE
        'mobile-xs': ['0.875rem', { lineHeight: '1.25rem' }],  // 14px
        'mobile-sm': ['1rem', { lineHeight: '1.5rem' }],       // 16px  
        'mobile-base': ['1.125rem', { lineHeight: '1.75rem' }], // 18px
        'mobile-lg': ['1.25rem', { lineHeight: '1.75rem' }],   // 20px
        'mobile-xl': ['1.375rem', { lineHeight: '1.875rem' }], // 22px
        'mobile-2xl': ['1.5rem', { lineHeight: '2rem' }],      // 24px
        'mobile-3xl': ['1.75rem', { lineHeight: '2.25rem' }],  // 28px
        'mobile-4xl': ['2rem', { lineHeight: '2.5rem' }],      // 32px
      },

      // Shadows disabled globally — separation is by surface + spacing.
      boxShadow: {
        'soft': 'none',
        'medium': 'none',
        'large': 'none',
        'theme': 'none',
        'sm': 'none',
        'DEFAULT': 'none',
        'md': 'none',
        'lg': 'none',
        'xl': 'none',
        '2xl': 'none',
        'inner': 'none',
        'none': 'none',
      },

      // Tightened border radius — editorial/academic feel, not bubbly
      borderRadius: {
        'lg': '0.375rem',  // 6px
        'xl': '0.5rem',    // 8px
        '2xl': '0.5rem',   // 8px — collapsed, no oversized rounding
        '3xl': '0.625rem', // 10px
      },

      // Professional backdrop blur
      backdropBlur: {
        xs: '2px',
      },

      // Gradients using CSS custom properties
      backgroundImage: {
        'gradient-primary': 'var(--color-gradientPrimary)',
        'gradient-secondary': 'var(--color-gradientSecondary)',
        'gradient-accent': 'var(--color-gradientAccent)',
      },

      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
    },
  },
  plugins: [],
}