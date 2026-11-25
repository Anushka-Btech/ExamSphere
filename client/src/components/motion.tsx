import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { ease, fadeUp, stagger } from '../lib/motion';

/** Counts up from 0 when it scrolls into view. Honors reduced motion by showing the final value straight away. */
export function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '', duration = 1.1, className }:
  { value: number; decimals?: number; suffix?: string; prefix?: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true });
  const fmt = (n: number) => `${prefix}${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  const [text, setText] = useState(() => fmt(reduce ? value : 0));
  useEffect(() => {
    if (reduce) { setText(fmt(value)); return; }
    if (!inView) return;
    const c = animate(0, value, { duration, ease, onUpdate: (n) => setText(fmt(n)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce, decimals, duration]);
  return <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</span>;
}

/** Wrap a grid/list; direct <StaggerItem> children rise in one after another. */
export function Stagger({ children, className, gap = 0.06, delay = 0 }: { children: ReactNode; className?: string; gap?: number; delay?: number }) {
  return <motion.div className={className} variants={stagger(gap, delay)} initial="hidden" animate="show">{children}</motion.div>;
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={fadeUp}>{children}</motion.div>;
}

/** Fades content in when it first scrolls into view (landing page sections). */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.45, delay, ease }}>
      {children}
    </motion.div>
  );
}
