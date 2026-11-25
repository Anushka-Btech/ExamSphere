import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { isoToLocalInput, localToIso } from '../../lib/format';
import { Button, Card, ErrorState, Input, PageHeader, Select, Skeleton, Textarea } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { useToast } from '../../components/Toast';

export default function ExamForm() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast();
  const subjects = useFetch<{ items: { subject_id: number; code: string; name: string }[] }>('/subjects?mine=1&status=ACTIVE&pageSize=100');
  const existing = useFetch<{ exam: { subject_id: number; title: string; description: string | null; scheduled_start: string; scheduled_end: string; duration_minutes: number; max_marks: number; passing_marks: number; status: string } }>(id ? `/exams/${id}` : null);
  const [v, setV] = useState({ subjectId: '', title: '', description: '', start: '', end: '', duration: '60', max: '20', pass: '8' });
  const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { const e = existing.data?.exam; if (e) setV({ subjectId: String(e.subject_id), title: e.title, description: e.description ?? '', start: isoToLocalInput(e.scheduled_start), end: isoToLocalInput(e.scheduled_end), duration: String(e.duration_minutes), max: String(e.max_marks), pass: String(e.passing_marks) }); }, [existing.data]);
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

  const validate = () => {
    const e: Record<string, string> = {}; const s = new Date(v.start).getTime(), en = new Date(v.end).getTime();
    if (!v.subjectId) e.subjectId = 'Choose a subject';
    if (v.title.trim().length < 3) e.title = 'Enter a title (3+ characters)';
    if (!v.start) e.start = 'Choose a start time'; else if (s <= Date.now()) e.start = 'Start must be in the future';
    if (!v.end) e.end = 'Choose an end time'; else if (en <= s) e.end = 'End must be after the start';
    if (!(Number(v.duration) > 0)) e.duration = 'Duration must be positive'; else if (s && en > s && Number(v.duration) > (en - s) / 60000) e.duration = 'Longer than the exam window';
    if (!(Number(v.max) > 0)) e.max = 'Must be greater than 0';
    if (Number(v.pass) < 0 || Number(v.pass) > Number(v.max)) e.pass = 'Between 0 and maximum marks';
    return e;
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); const e = validate(); setErrs(e); if (Object.keys(e).length) return; setBusy(true);
    const body = { subjectId: Number(v.subjectId), title: v.title.trim(), description: v.description.trim() || null, scheduledStart: localToIso(v.start), scheduledEnd: localToIso(v.end),
      durationMinutes: Number(v.duration), maxMarks: Number(v.max), passingMarks: Number(v.pass) };
    try {
      const r = await api<{ examId?: number }>(id ? `/exams/${id}` : '/exams', { method: id ? 'PUT' : 'POST', body });
      toast.success(id ? 'Examination updated' : 'Draft created. Now assign questions.'); nav(`/faculty/exams/${id ?? r.examId}`);
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };

  if (id && existing.loading) return <Skeleton className="h-96" />;
  if (id && existing.error) return <ErrorState message={existing.error} />;
  if (id && existing.data && existing.data.exam.status !== 'DRAFT') return <ErrorState message="Only draft examinations can be edited. Return it to draft from the detail page first." />;
  return (
    <>
      <PageHeader title={id ? 'Edit draft examination' : 'New examination'} subtitle="Questions are assigned on the next screen. The total question marks must equal the maximum marks before you can schedule." />
      <Card className="max-w-3xl p-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Select label="Subject" value={v.subjectId} onChange={(e) => set('subjectId', e.target.value)} error={errs.subjectId} hint="Only subjects you are assigned to appear here.">
            <option value="">Select…</option>{subjects.data?.items.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.code} · {s.name}</option>)}</Select>
          <Input label="Title" value={v.title} onChange={(e) => set('title', e.target.value)} error={errs.title} />
          <Textarea label="Description (optional)" value={v.description} onChange={(e) => set('description', e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Window opens" type="datetime-local" value={v.start} onChange={(e) => set('start', e.target.value)} error={errs.start} />
            <Input label="Window closes" type="datetime-local" value={v.end} onChange={(e) => set('end', e.target.value)} error={errs.end} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Duration (minutes)" type="number" min="1" value={v.duration} onChange={(e) => set('duration', e.target.value)} error={errs.duration} hint="Per student, from their start." />
            <Input label="Maximum marks" type="number" min="1" step="0.5" value={v.max} onChange={(e) => set('max', e.target.value)} error={errs.max} />
            <Input label="Passing marks" type="number" min="0" step="0.5" value={v.pass} onChange={(e) => set('pass', e.target.value)} error={errs.pass} />
          </div>
          <div className="flex justify-end gap-2 pt-2"><Link to={id ? `/faculty/exams/${id}` : '/faculty/exams'}><Button type="button" variant="secondary">Cancel</Button></Link><Button type="submit" loading={busy}>{id ? 'Save changes' : 'Create draft'}</Button></div>
        </form>
      </Card>
    </>
  );
}
