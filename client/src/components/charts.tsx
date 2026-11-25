import { useReducedMotion } from 'framer-motion';
import { useChartColors, useTheme } from '../lib/theme';

/** Shared Recharts styling so every chart matches the active theme, and animates only when motion is allowed. */
export function useChartKit() {
  const c = useChartColors();
  const { prefs } = useTheme();
  const reduce = useReducedMotion() || prefs.reduceMotion;
  return {
    c,
    anim: { isAnimationActive: !reduce, animationDuration: 900, animationEasing: 'ease-out' as const },
    axis: { tick: { fontSize: 12, fill: c.axis }, axisLine: false as const, tickLine: false as const },
    grid: { stroke: c.grid, strokeDasharray: '3 4', vertical: false as const },
    cursor: { fill: c.grid, fillOpacity: 0.35 },
  };
}
