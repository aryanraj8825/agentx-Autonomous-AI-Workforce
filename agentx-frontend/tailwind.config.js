const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        raised: v('raised'),
        line: v('line'),
        'line-strong': v('line-strong'),
        fg: v('fg'),
        muted: v('muted'),
        faint: v('faint'),
        accent: v('accent'),
        'accent-ink': v('accent-ink'),
        'accent-text': v('accent-text'),
        ok: v('ok'),
        warn: v('warn'),
        bad: v('bad'),
        info: v('info'),
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        pop: '0 12px 40px -8px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(var(--line) / 1)',
      },
      keyframes: {
        dash: { to: { strokeDashoffset: '-24' } },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        dash: 'dash 0.9s linear infinite',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
