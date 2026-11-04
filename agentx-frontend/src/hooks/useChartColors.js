import { useEffect, useState } from 'react';
import { useApp } from '../store/AppStore';

const NAMES = ['accent-text', 'fg', 'muted', 'faint', 'line', 'line-strong', 'surface', 'ok', 'bad', 'warn', 'info',
  'a-supervisor', 'a-planner', 'a-researcher', 'a-analyst', 'a-executor', 'a-writer', 'a-reviewer'];

/** Resolves CSS design tokens to concrete colours so Recharts (SVG attributes) follows the theme. */
export function useChartColors() {
  const { state } = useApp();
  const [c, setC] = useState({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    NAMES.forEach((n) => {
      const v = cs.getPropertyValue(`--${n}`).trim();
      out[n] = v ? `rgb(${v})` : '#888';
    });
    setC(out);
  }, [state.theme]);
  return c;
}
