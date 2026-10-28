import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          dark: 'var(--color-primary-dark)',
          subtle: 'var(--color-primary-subtle)'
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          subtle: 'var(--color-accent-subtle)'
        },
        background: 'var(--color-background)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          muted: 'var(--color-surface-muted)'
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)'
        },
        text: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)'
        },
        success: {
          DEFAULT: 'var(--color-success)',
          text: 'var(--color-success-text)',
          subtle: 'var(--color-success-subtle)'
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          text: 'var(--color-warning-text)',
          subtle: 'var(--color-warning-subtle)'
        },
        error: {
          DEFAULT: 'var(--color-error)',
          text: 'var(--color-error-text)',
          subtle: 'var(--color-error-subtle)'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
