import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, PlayCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, StatusBadge, Table, TableSkeleton, Td, Th } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { useToast } from '../../components/Toast';

interface Exam { exam_id: number; title: string; status: string; scheduled_start: string; scheduled_end: string; duration_minutes: number; max_marks: number;
  subject_code: string; subject_name: string; attempt_id: number | null; attempt_status: string | null }

export default function StudentExams() {
  const { data, loading, error, reload } = useFetch<{ exams: Exam[] }>('/student/exams');
  const nav = useNavigate(); const toast = useToast();
  const [pick, setPick] = useState<Exam | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!pick) return; setBusy(true);
    try { const r = await api<{ attemptId: number }>(`/student/exams/${pick.exam_id}/start`, { method: 'POST' }); nav(`/student/attempt/${r.attemptId}`); }
    catch (e) { toast.error((e as Error).message); setPick(null); reload(); }
    finally { setBusy(false); }
  };

  const action = (x: Exam) => {
    if (x.attempt_status === 'IN_PROGRESS') return <Button size="sm" onClick={() => nav(`/student/attempt/${x.attempt_id}`)}><PlayCircle className="h-4 w-4" aria-hidden />Resume</Button>;
    if (x.attempt_status) return <StatusBadge value={x.attempt_status} />;
    if (x.status === 'LIVE') return <Button size="sm" onClick={() => setPick(x)}>Start exam</Button>;
    if (x.status === 'SCHEDULED') return <span className="text-xs text-muted">Opens {fmtDateTime(x.scheduled_start)}</span>;
    return <span className="text-xs text-muted">Not attempted</span>;
  };

  return (
    <>
      <PageHeader title="My examinations" subtitle="Examinations for your department and semester." />
      <Card>
        {loading ? <TableSkeleton cols={5} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.exams.length ? <EmptyState title="No examinations yet" message="Scheduled examinations for your subjects will appear here." /> : (
          <Table>
            <thead><tr><Th>Examination</Th><Th>Subject</Th><Th>Window</Th><Th>Duration</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{data.exams.map((x) => (
              <tr key={x.exam_id}>
                <Td className="font-medium">{x.title}</Td><Td>{x.subject_code}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(x.scheduled_start)}<br />to {fmtDateTime(x.scheduled_end)}</Td>
                <Td>{x.duration_minutes} min</Td><Td><StatusBadge value={x.status} /></Td><Td className="text-right">{action(x)}</Td>
              </tr>))}</tbody>
          </Table>)}
      </Card>
      <ConfirmDialog open={!!pick} title="Start examination?" confirmLabel="Start now" loading={busy} onClose={() => setPick(null)} onConfirm={start}
        message={pick && (<ul className="list-disc space-y-1.5 pl-5"><li>{pick.title} · {pick.duration_minutes} minutes, {pick.max_marks} marks.</li>
          <li>The clock starts now and cannot be paused. The server enforces the deadline.</li><li>Your answers are saved automatically. You can attempt this exam only once.</li></ul>)} />
      <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Clock className="h-4 w-4" aria-hidden />Times are shown in your local time zone.</p>
    </>
  );
}
