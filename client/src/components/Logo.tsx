import { useId } from 'react';

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="ExamSphere logo">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stopColor="#6366F1" /><stop offset="1" stopColor="#8B5CF6" /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <circle cx="16" cy="16" r="8" fill="none" stroke="#fff" strokeWidth="2" />
      <ellipse cx="16" cy="16" rx="3.6" ry="8" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.6" />
      <path d="M8 16h16" stroke="#fff" strokeOpacity=".9" strokeWidth="1.6" />
    </svg>
  );
}
/** `onDark` flips the wordmark to white for the navy sidebar and hero. */
export const Brand = ({ compact, onDark }: { compact?: boolean; onDark?: boolean }) => (
  <span className="flex items-center gap-2.5"><LogoMark />{!compact && <span className={`text-[1.05rem] font-semibold tracking-tight ${onDark ? 'text-white' : 'text-ink'}`}>ExamSphere</span>}</span>
);
