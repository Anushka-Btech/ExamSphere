import type { Transition, Variants } from 'framer-motion';

/** One easing curve and a few durations, so every animation in the product feels like the same hand made it. */
export const ease = [0.22, 1, 0.36, 1] as const;
export const spring: Transition = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 };
export const soft: Transition = { duration: 0.28, ease };

export const fadeUp: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: soft } };
export const fadeIn: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.25 } } };
export const stagger = (gap = 0.06, delay = 0): Variants => ({ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } });

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
};

export const popover: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } },
};
