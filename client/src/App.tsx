import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth, type Role } from './lib/auth';
import AppShell from './components/AppShell';
import { Skeleton } from './components/ui';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Analytics from './pages/Analytics';
import AdminDashboard from './pages/admin/AdminDashboard';
import Students from './pages/admin/Students';
import Faculty from './pages/admin/Faculty';
import Subjects from './pages/admin/Subjects';
import ExamsList from './pages/faculty/ExamsList';
import ExamDetail from './pages/faculty/ExamDetail';
import ExamForm from './pages/faculty/ExamForm';
import FacultyDashboard from './pages/faculty/FacultyDashboard';
import Questions from './pages/faculty/Questions';
import Evaluation from './pages/faculty/Evaluation';
import StudentDashboard from './pages/student/StudentDashboard';
import StudentExams from './pages/student/StudentExams';
import { StudentResultDetail, StudentResults } from './pages/student/StudentResults';
import ExamTake from './pages/student/ExamTake';

/**
 * Route guard. This only improves the experience (redirects); it is NOT the security boundary.
 * Every API call is authorised again on the server from the session cookie, so editing client state gets nobody any data.
 */
function Guard({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth(); const loc = useLocation();
  if (loading) return <div className="mx-auto max-w-3xl space-y-4 p-8" role="status" aria-label="Loading"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-brand-600">404</p><h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">The page you are looking for does not exist.</p>
      <Link to="/" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Go home</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      <Route path="/admin" element={<Guard role="ADMIN"><AppShell /></Guard>}>
        <Route index element={<AdminDashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="faculty" element={<Faculty />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="exams" element={<ExamsList />} />
        <Route path="exams/:id" element={<ExamDetail />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>

      <Route path="/faculty" element={<Guard role="FACULTY"><AppShell /></Guard>}>
        <Route index element={<FacultyDashboard />} />
        <Route path="questions" element={<Questions />} />
        <Route path="exams" element={<ExamsList />} />
        <Route path="exams/new" element={<ExamForm />} />
        <Route path="exams/:id" element={<ExamDetail />} />
        <Route path="exams/:id/edit" element={<ExamForm />} />
        <Route path="evaluation" element={<Evaluation />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>

      <Route path="/student/attempt/:attemptId" element={<Guard role="STUDENT"><ExamTake /></Guard>} />
      <Route path="/student" element={<Guard role="STUDENT"><AppShell /></Guard>}>
        <Route index element={<StudentDashboard />} />
        <Route path="exams" element={<StudentExams />} />
        <Route path="results" element={<StudentResults />} />
        <Route path="results/:examId" element={<StudentResultDetail />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
