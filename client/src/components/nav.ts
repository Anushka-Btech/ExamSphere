import { BarChart3, BookOpen, ClipboardCheck, FileQuestion, GraduationCap, LayoutDashboard, Library, Presentation, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { Role } from '../lib/auth';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

/** Single source of truth for the sidebar AND the global search "Pages" group. */
export const NAV: Record<Role, NavItem[]> = {
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/students', label: 'Students', icon: GraduationCap },
    { to: '/admin/faculty', label: 'Faculty', icon: Users },
    { to: '/admin/subjects', label: 'Subjects', icon: BookOpen },
    { to: '/admin/exams', label: 'Examinations', icon: Presentation },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  ],
  FACULTY: [
    { to: '/faculty', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/faculty/questions', label: 'Question bank', icon: Library },
    { to: '/faculty/exams', label: 'Examinations', icon: Presentation },
    { to: '/faculty/evaluation', label: 'Evaluation', icon: ClipboardCheck },
    { to: '/faculty/analytics', label: 'Analytics', icon: BarChart3 },
  ],
  STUDENT: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/exams', label: 'My examinations', icon: FileQuestion },
    { to: '/student/results', label: 'Results', icon: Trophy },
  ],
};

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrator', FACULTY: 'Faculty', STUDENT: 'Student' };
