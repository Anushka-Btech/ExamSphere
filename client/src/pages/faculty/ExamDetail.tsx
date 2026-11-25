import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, CalendarCheck, Pencil, Plus, Send, Trash2, Undo2, XCircle } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime, num, pct } from '../../lib/format';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Skeleton, StatusBadge, Table, Td, Th } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { useToast } from '../../components/Toast';

interface ExamData { exam: { exam_id: number; subject_id: number; title: string; description: string | null; status: string; scheduled_start: string; scheduled_end: string; duration_minutes: number; max_marks: number; passing_marks: number; subject_code: string; subject_name: string; owner: string; results_published: number };
  questions: { exam_question_id: number; question_id: number; display_order: number; marks: number; question_text: string; question_type: string; difficulty: string }[]; assignedMarks: number; marksBalanced: boolean }
interface Results { statistics: { attempts_total: number; attempts_pending: number; attempts_evaluated: number; avg_marks: number | null; highest_marks: number | null; lowest_marks: number | null; pass_percentage: number | null; is_published: number };
  results: { attempt_id: number; student_id: number; student_name: string; enrollment_no: string; total_marks: number; max_marks: number; percentage: number; result: string | null; result_state: string; dense_rank_in_exam: number | null }[] }
interface BankQ { question_id: number; question_text: string; question_type: string; difficulty: string; default_marks: number }

export default function ExamDetail() {
  const { id } = useParams(); const { user } = useAuth(); const toast = useToast();
  const owner = user?.role === 'FACULTY';
  const d = useFetch<ExamData>(`/exams/${id}`);
  const status = d.data?.exam.status;
  const showResults = !!status && ['LIVE', 'COMPLETED'].includes(status);
  const r = useFetch<Results>(showResults ? `/exams/${id}/results` : null);
  const pubs = useFetch<{ items: { publication_id: number; action: string; note: string | null; published_at: string; by_name: string }[] }>(showResults ? `/exams/${id}/publications` : null);
  const [confirm, setConfirm] = useState<null | 'schedule' | 'unschedule' | 'cancel' | 'publish'>(null); const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<number | null>(null);

  const reloadAll = () => { d.reload(); r.reload(); pubs.reload(); };
  const run = async () => {
    if (!confirm) return; setBusy(true);
    const path = { schedule: 'schedule', unschedule: 'unschedule', cancel: 'cancel', publish: 'publish-results' }[confirm];
    try { await api(`/exams/${id}/${path}`, { method: 'POST' }); toast.success({ schedule: 'Examination scheduled', unschedule: 'Returned to draft', cancel: 'Examination cancelled', publish: 'Results published' }[confirm]); setConfirm(null); reloadAll(); }
    catch (e) { toast.error((e as Error).message); setConfirm(null); } finally { setBusy(false); }
  };

  if (d.loading) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48" /></div>;
  if (d.error || !d.data) return <ErrorState message={d.error ?? 'Not found'} onRetry={d.reload} />;
  const { exam, questions } = d.data; const published = !!exam.results_published;
  const base = user?.role === 'ADMIN' ? '/admin' : '/faculty';

  return (
    <>
      <PageHeader title={exam.title} subtitle={`${exam.subject_code} · ${exam.subject_name} · owner ${exam.owner}`}
        actions={<>
          <StatusBadge value={exam.status} />{published && <StatusBadge value="PUBLISHED" />}
          {owner && exam.status === 'DRAFT' && <><Link to={`/faculty/exams/${id}/edit`}><Button variant="secondary" size="sm"><Pencil className="h-4 w-4" aria-hidden />Edit</Button></Link>
            <Button size="sm" disabled={!questions.length || !d.data.marksBalanced} onClick={() => setConfirm('schedule')}><CalendarCheck className="h-4 w-4" aria-hidden />Schedule</Button></>}
          {owner && exam.status === 'SCHEDULED' && <Button variant="secondary" size="sm" onClick={() => setConfirm('unschedule')}><Undo2 className="h-4 w-4" aria-hidden />Return to draft</Button>}
          {owner && ['DRAFT', 'SCHEDULED', 'LIVE'].includes(exam.status) && <Button variant="ghost" size="sm" onClick={() => setConfirm('cancel')}><XCircle className="h-4 w-4" aria-hidden />Cancel</Button>}
          {owner && exam.status === 'COMPLETED' && !published && <Button size="sm" onClick={() => setConfirm('publish')}><Send className="h-4 w-4" aria-hidden />Publish results</Button>}
        </>} />

      <Card className="mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[['Window', `${fmtDateTime(exam.scheduled_start)} to ${fmtDateTime(exam.scheduled_end)}`], ['Duration', `${exam.duration_minutes} minutes`], ['Maximum marks', num(exam.max_marks)], ['Passing marks', num(exam.passing_marks)]].map(([k, v]) => (
          <div key={k}><p className="text-xs text-muted">{k}</p><p className="mt-0.5 text-sm font-medium">{v}</p></div>))}
        {exam.description && <p className="text-sm text-muted sm:col-span-2 lg:col-span-4">{exam.description}</p>}
      </Card>

      {owner && exam.status === 'DRAFT' ? <Assignment examId={Number(id)} subjectId={exam.subject_id} maxMarks={Number(exam.max_marks)} initial={questions} onSaved={d.reload} /> : (
        <Card className="mb-6"><div className="border-b border-line px-4 py-3"><h2 className="font-semibold">Questions <span className="font-normal text-muted">({questions.length}, {num(d.data.assignedMarks)} marks)</span></h2></div>
          {!questions.length ? <EmptyState title="No questions assigned" /> : (<Table><thead><tr><Th>#</Th><Th>Question</Th><Th>Type</Th><Th>Marks</Th></tr></thead>
            <tbody>{questions.map((q) => (<tr key={q.exam_question_id}><Td>{q.display_order}</Td><Td className="max-w-lg"><span className="line-clamp-2">{q.question_text}</span></Td><Td><Badge>{q.question_type.replace('_', '/')}</Badge></Td><Td>{num(q.marks)}</Td></tr>))}</tbody></Table>)}</Card>)}

      {showResults && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3"><h2 className="font-semibold">Results</h2>
            {r.data && <p className="text-xs text-muted">Averages and pass rate use evaluated attempts only.</p>}</div>
          {r.loading ? <div className="p-4"><Skeleton className="h-24" /></div> : r.error || !r.data ? <ErrorState message={r.error ?? 'No data'} onRetry={r.reload} /> : (<>
            <div className="grid gap-4 border-b border-line p-4 sm:grid-cols-3 lg:grid-cols-6">
              {[['Attempts', r.data.statistics.attempts_total], ['Pending eval.', r.data.statistics.attempts_pending], ['Average', num(r.data.statistics.avg_marks)], ['Highest', num(r.data.statistics.highest_marks)], ['Lowest', num(r.data.statistics.lowest_marks)], ['Pass rate', pct(r.data.statistics.pass_percentage)]].map(([k, v]) => (
                <div key={String(k)}><p className="text-xs text-muted">{k}</p><p className="text-lg font-semibold">{v}</p></div>))}</div>
            {!r.data.results.length ? <EmptyState title="No submitted attempts yet" /> : (
              <Table><thead><tr><Th>Rank</Th><Th>Student</Th><Th>Enrollment</Th><Th>Marks</Th><Th>%</Th><Th>Result</Th><Th>State</Th><Th /></tr></thead>
                <tbody>{r.data.results.map((x) => (<tr key={x.student_id}><Td>{x.dense_rank_in_exam ?? '-'}</Td><Td className="font-medium">{x.student_name}</Td><Td>{x.enrollment_no}</Td>
                  <Td>{x.result ? `${num(x.total_marks)} / ${num(x.max_marks)}` : <span className="text-muted" title="Provisional: written answers not yet marked">{num(x.total_marks)}*</span>}</Td><Td>{x.result ? pct(x.percentage) : '-'}</Td>
                  <Td><StatusBadge value={x.result} /></Td><Td><StatusBadge value={x.result_state} /></Td>
                  <Td className="text-right"><Button variant="ghost" size="sm" onClick={() => setAttempt(x.attempt_id)}>View</Button></Td></tr>))}</tbody></Table>)}
            {r.data.results.some((x) => !x.result) && <p className="px-4 py-2 text-xs text-muted">* Provisional: written answers are not fully marked, so this is not a final score.</p>}
          </>)}
          {pubs.data && pubs.data.items.length > 0 && (<div className="border-t border-line p-4"><h3 className="mb-2 text-sm font-semibold">Publication history</h3>
            <ul className="space-y-1.5 text-sm">{pubs.data.items.map((p) => (<li key={p.publication_id} className="flex flex-wrap items-center gap-2"><Badge tone={p.action === 'PUBLISH' ? 'green' : 'amber'}>{p.action === 'PUBLISH' ? 'Published' : 'Correction'}</Badge>
              <span className="text-muted">{fmtDateTime(p.published_at)} by {p.by_name}</span>{p.note && <span>· {p.note}</span>}</li>))}</ul></div>)}
        </Card>)}

      {attempt !== null && r.data && <AttemptModal examId={Number(id)} attemptId={attempt} attemptsOf={r.data.results} published={published} canEdit={owner} onClose={() => setAttempt(null)} onChanged={reloadAll} />}

      <ConfirmDialog open={!!confirm} danger={confirm === 'cancel'} loading={busy} onClose={() => setConfirm(null)} onConfirm={run}
        title={{ schedule: 'Schedule this examination?', unschedule: 'Return to draft?', cancel: 'Cancel this examination?', publish: 'Publish results?', '': '' }[confirm ?? '']}
        confirmLabel={{ schedule: 'Schedule', unschedule: 'Return to draft', cancel: 'Cancel examination', publish: 'Publish', '': '' }[confirm ?? '']}
        message={{ schedule: 'Students in the subject’s department and semester will be able to start it when the window opens. Question marks are validated now.', unschedule: 'Allowed only while no student has started it.', cancel: 'Students will no longer be able to attempt it. This cannot be undone.', publish: 'Students will see their marks and correct answers. Later changes need an audited correction. This cannot be undone.', '': '' }[confirm ?? '']} />
      <p className="text-xs text-muted"><Link className="hover:underline" to={`${base}/exams`}>Back to examinations</Link></p>
    </>
  );
}

/** Draft-only editor: choose questions from the bank and set their marks. The server re-validates everything. */
function Assignment({ examId, subjectId, maxMarks, initial, onSaved }: { examId: number; subjectId: number; maxMarks: number; initial: ExamData['questions']; onSaved: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<{ questionId: number; text: string; type: string; marks: string }[]>(initial.map((q) => ({ questionId: q.question_id, text: q.question_text, type: q.question_type, marks: String(q.marks) })));
  const [type, setType] = useState(''); const [busy, setBusy] = useState(false);
  const bank = useFetch<{ items: BankQ[] }>(`/questions${qs({ subjectId, type, pageSize: 100 })}`);
  useEffect(() => { setSel(initial.map((q) => ({ questionId: q.question_id, text: q.question_text, type: q.question_type, marks: String(q.marks) }))); }, [initial]);
  const total = useMemo(() => sel.reduce((t, q) => t + (Number(q.marks) || 0), 0), [sel]);
  const chosen = new Set(sel.map((s) => s.questionId));
  const move = (i: number, dir: -1 | 1) => setSel((s) => { const n = [...s]; const j = i + dir; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = async () => {
    if (sel.some((q) => !(Number(q.marks) > 0))) { toast.error('Every question needs marks greater than 0'); return; }
    setBusy(true);
    try { await api(`/exams/${examId}/questions`, { method: 'PUT', body: { questions: sel.map((q) => ({ questionId: q.questionId, marks: Number(q.marks) })) } }); toast.success('Question set saved'); onSaved(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const balanced = total === maxMarks;
  return (
    <div className="mb-6 grid gap-5 lg:grid-cols-2">
      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">Assigned questions</h2>
          <span className={`text-sm font-medium ${balanced ? 'text-ok' : 'text-warn'}`} aria-live="polite">{num(total)} / {num(maxMarks)} marks</span></div>
        {!sel.length ? <EmptyState title="Nothing assigned yet" message="Add questions from the bank on the right." /> : (
          <ul className="divide-y divide-line">{sel.map((q, i) => (
            <li key={q.questionId} className="flex items-center gap-2 p-3"><span className="w-6 text-sm text-muted">{i + 1}</span><p className="line-clamp-2 flex-1 text-sm">{q.text}</p>
              <input aria-label={`Marks for question ${i + 1}`} type="number" min="0.5" step="0.5" value={q.marks} onChange={(e) => setSel((s) => s.map((x, j) => (j === i ? { ...x, marks: e.target.value } : x)))} className="w-16 rounded-lg border border-line px-2 py-1 text-sm" />
              <Button variant="ghost" size="sm" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === sel.length - 1}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" aria-label="Remove question" onClick={() => setSel((s) => s.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></li>))}</ul>)}
        <div className="flex items-center justify-between gap-3 border-t border-line p-3">
          <p className="text-xs text-muted">{balanced ? 'Marks match the maximum. You can schedule after saving.' : 'Marks must equal the maximum before scheduling.'}</p><Button onClick={save} loading={busy}>Save question set</Button></div>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><h2 className="font-semibold">Question bank</h2>
          <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-sm"><option value="">All types</option><option value="MCQ">MCQ</option><option value="TRUE_FALSE">True/False</option><option value="SHORT">Short</option><option value="DESCRIPTIVE">Descriptive</option></select></div>
        {bank.loading ? <div className="p-4"><Skeleton className="h-32" /></div> : bank.error ? <ErrorState message={bank.error} onRetry={bank.reload} /> : !bank.data?.items.length ? <EmptyState title="No questions for this subject" message="Add questions in the question bank first." /> : (
          <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">{bank.data.items.map((q) => (
            <li key={q.question_id} className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm">{q.question_text}</p><p className="mt-0.5 text-xs text-muted">{q.question_type.replace('_', '/')} · {q.difficulty.toLowerCase()} · {num(q.default_marks)} marks</p></div>
              <Button variant="secondary" size="sm" disabled={chosen.has(q.question_id)} onClick={() => setSel((s) => [...s, { questionId: q.question_id, text: q.question_text, type: q.question_type, marks: String(q.default_marks) }])}>
                <Plus className="h-4 w-4" aria-hidden />{chosen.has(q.question_id) ? 'Added' : 'Add'}</Button></li>))}</ul>)}
      </Card>
    </div>
  );
}

interface AttemptDetail { attempt: { attempt_id: number; student_name: string; enrollment_no: string; status: string };
  answers: { exam_question_id: number; display_order: number; max_marks: number; question_text: string; question_type: string; model_answer: string | null; awarded_marks: number | null; evaluation_status: string | null; answer_text: string | null; selected_option: string | null; correct_option: string | null }[] }

/** One student's answers. Before publication faculty mark written answers here; after it, changes go through the correction workflow. */
function AttemptModal({ examId, attemptId, attemptsOf, published, canEdit, onClose, onChanged }: { examId: number; attemptId: number; attemptsOf: Results['results']; published: boolean; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const det = useFetch<AttemptDetail>(`/exams/${examId}/attempts/${attemptId}`);
  const [marks, setMarks] = useState<Record<number, string>>({}); const [note, setNote] = useState(''); const [busyId, setBusyId] = useState<number | null>(null);
  const who = attemptsOf.find((x) => x.attempt_id === attemptId);
  const save = async (a: AttemptDetail['answers'][number]) => {
    const m = Number(marks[a.exam_question_id]); if (!Number.isFinite(m) || m < 0 || m > Number(a.max_marks)) { toast.error(`Marks must be between 0 and ${a.max_marks}`); return; }
    if (published && note.trim().length < 5) { toast.error('Enter a reason for the correction (5+ characters)'); return; }
    setBusyId(a.exam_question_id);
    try {
      if (published) await api(`/exams/${examId}/corrections`, { method: 'POST', body: { attemptId, examQuestionId: a.exam_question_id, marks: m, note: note.trim() } });
      else await api('/exams/evaluations', { method: 'PUT', body: { attemptId, examQuestionId: a.exam_question_id, marks: m } });
      toast.success(published ? 'Correction recorded' : 'Marks saved'); det.reload(); onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusyId(null); }
  };
  return (
    <Modal open onClose={onClose} title={who ? `${who.student_name} (${who.enrollment_no})` : 'Attempt'} wide>
      {!det.data ? <Skeleton className="h-40" /> : (<div className="space-y-4">
        {published && canEdit && <Input label="Reason for any correction" value={note} onChange={(e) => setNote(e.target.value)} hint="Required. Recorded in the publication history and audit log." />}
        <ol className="space-y-3">{det.data.answers.map((a) => { const obj = a.question_type === 'MCQ' || a.question_type === 'TRUE_FALSE'; const pending = a.evaluation_status === 'PENDING';
          return (<li key={a.exam_question_id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-start justify-between gap-3"><p className="font-medium">{a.display_order}. {a.question_text}</p><Badge tone={pending ? 'amber' : 'indigo'}>{pending ? 'Needs marks' : `${num(a.awarded_marks ?? 0)} / ${num(a.max_marks)}`}</Badge></div>
            {obj ? <p className="mt-2 text-muted">Chose: <span className="text-ink">{a.selected_option ?? 'no answer'}</span> · Correct: <span className="text-ink">{a.correct_option}</span></p> : (<>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-2">{a.answer_text?.trim() || <span className="text-muted">No answer</span>}</p>
              {a.model_answer && <p className="mt-2 text-xs text-muted">Model answer: {a.model_answer}</p>}
              {canEdit && a.answer_text?.trim() && (<div className="mt-2 flex items-end gap-2"><label className="text-xs text-muted">Marks (max {num(a.max_marks)})
                <input type="number" min="0" max={a.max_marks} step="0.5" value={marks[a.exam_question_id] ?? (a.awarded_marks ?? '')} onChange={(e) => setMarks((m) => ({ ...m, [a.exam_question_id]: e.target.value }))} className="mt-1 block w-24 rounded-lg border border-line px-2 py-1.5 text-sm text-ink" /></label>
                <Button size="sm" loading={busyId === a.exam_question_id} onClick={() => save(a)}>{published ? 'Apply correction' : 'Save marks'}</Button></div>)}</>)}
          </li>); })}</ol></div>)}
    </Modal>
  );
}
