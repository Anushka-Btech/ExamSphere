import { useEffect, useState, type FormEvent } from 'react';
import { Archive, Eye, FileUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, FilterSelect, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, Table, TableSkeleton, Td, Textarea, Th } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { useToast } from '../../components/Toast';
import { num } from '../../lib/format';
import { initialSearch } from '../../lib/format';

type QType = 'MCQ' | 'TRUE_FALSE' | 'SHORT' | 'DESCRIPTIVE';
interface Row { question_id: number; question_text: string; question_type: QType; difficulty: string; default_marks: number; subject_code: string; created_by_name: string; used_in_exams: number }
interface Subj { subject_id: number; code: string; name: string }
const TYPES: Record<QType, string> = { MCQ: 'Multiple choice', TRUE_FALSE: 'True / False', SHORT: 'Short answer', DESCRIPTIVE: 'Descriptive' };

interface FormState { subjectId: number | ''; text: string; type: QType; difficulty: string; marks: string; modelAnswer: string; options: { text: string; isCorrect: boolean }[]; tf: 'true' | 'false' }
const blank = (subjectId: number | ''): FormState => ({ subjectId, text: '', type: 'MCQ', difficulty: 'MEDIUM', marks: '2', modelAnswer: '', options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }], tf: 'true' });

export default function Questions() {
  const toast = useToast();
  const [f, setF] = useState({ search: initialSearch(), subjectId: '', difficulty: '', type: '', page: 1 });
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(f.search), 300); return () => clearTimeout(t); }, [f.search]);
  const subjects = useFetch<{ items: Subj[] }>('/subjects?mine=1&pageSize=100');
  const { data, loading, error, reload } = useFetch<{ items: Row[]; total: number; page: number; pageSize: number }>(`/questions${qs({ search: debounced, subjectId: f.subjectId, difficulty: f.difficulty, type: f.type, page: f.page, pageSize: 10 })}`);

  const [form, setForm] = useState<{ id: number | null; v: FormState } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ question: Row & { model_answer: string | null }; options: { option_text: string; is_correct: number }[] } | null>(null);
  const [archive, setArchive] = useState<Row | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const setFilter = (k: string, v: string) => setF((p) => ({ ...p, [k]: v, page: 1 }));

  const openNew = () => { setErrs({}); setForm({ id: null, v: blank(subjects.data?.items[0]?.subject_id ?? '') }); };
  const openEdit = async (r: Row) => {
    try {
      const d = await api<{ question: { subject_id: number; question_text: string; question_type: QType; difficulty: string; default_marks: number; model_answer: string | null }; options: { option_text: string; is_correct: number }[] }>(`/questions/${r.question_id}`);
      const q = d.question; const v = blank(q.subject_id);
      Object.assign(v, { text: q.question_text, type: q.question_type, difficulty: q.difficulty, marks: String(q.default_marks), modelAnswer: q.model_answer ?? '' });
      if (q.question_type === 'MCQ') v.options = d.options.map((o) => ({ text: o.option_text, isCorrect: !!o.is_correct }));
      if (q.question_type === 'TRUE_FALSE') v.tf = d.options.find((o) => o.is_correct)?.option_text === 'True' ? 'true' : 'false';
      setErrs({}); setForm({ id: r.question_id, v });
    } catch (e) { toast.error((e as Error).message); }
  };
  const openPreview = async (r: Row) => { try { setPreview(await api(`/questions/${r.question_id}`)); } catch (e) { toast.error((e as Error).message); } };

  const validate = (v: FormState) => {
    const e: Record<string, string> = {};
    if (!v.subjectId) e.subjectId = 'Choose a subject';
    if (v.text.trim().length < 5) e.text = 'Write the question (at least 5 characters)';
    if (!(Number(v.marks) > 0)) e.marks = 'Marks must be greater than 0';
    if (v.type === 'MCQ') {
      const filled = v.options.filter((o) => o.text.trim());
      if (filled.length < 2) e.options = 'Provide at least two options';
      else if (!v.options.some((o) => o.isCorrect && o.text.trim())) e.options = 'Mark exactly one filled option as correct';
    }
    return e;
  };
  const save = async (ev: FormEvent) => {
    ev.preventDefault(); if (!form) return;
    const e = validate(form.v); setErrs(e); if (Object.keys(e).length) return;
    const v = form.v; setBusy(true);
    const body = { subjectId: Number(v.subjectId), text: v.text.trim(), type: v.type, difficulty: v.difficulty, defaultMarks: Number(v.marks),
      ...(v.type === 'MCQ' ? { options: v.options.filter((o) => o.text.trim()).map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })) } : {}),
      ...(v.type === 'TRUE_FALSE' ? { trueFalseAnswer: v.tf === 'true' } : {}),
      ...(v.type === 'SHORT' || v.type === 'DESCRIPTIVE' ? { modelAnswer: v.modelAnswer.trim() || null } : {}) };
    try {
      await api(form.id ? `/questions/${form.id}` : '/questions', { method: form.id ? 'PUT' : 'POST', body });
      toast.success(form.id ? 'Question updated' : 'Question added'); setForm(null); reload();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const doArchive = async () => {
    if (!archive) return; setBusy(true);
    try { await api(`/questions/${archive.question_id}/archive`, { method: 'POST' }); toast.success('Question archived'); setArchive(null); reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const v = form?.v; const patch = (p: Partial<FormState>) => setForm((x) => x && { ...x, v: { ...x.v, ...p } });
  const setOpt = (i: number, p: Partial<{ text: string; isCorrect: boolean }>) => patch({ options: v!.options.map((o, j) => (j === i ? { ...o, ...p } : p.isCorrect ? { ...o, isCorrect: false } : o)) });

  return (
    <>
      <PageHeader title="Question bank" subtitle="Questions for the subjects you teach." actions={<>
        <Button variant="secondary" onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" aria-hidden />Import CSV</Button><Button onClick={openNew}><Plus className="h-4 w-4" aria-hidden />Add question</Button></>} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput placeholder="Search question text" value={f.search} onChange={(e) => setFilter('search', e.target.value)} />
          <FilterSelect label="Subject" value={f.subjectId} onChange={(e) => setFilter('subjectId', e.target.value)}><option value="">All subjects</option>{subjects.data?.items.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.code}</option>)}</FilterSelect>
          <FilterSelect label="Difficulty" value={f.difficulty} onChange={(e) => setFilter('difficulty', e.target.value)}><option value="">Any difficulty</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></FilterSelect>
          <FilterSelect label="Type" value={f.type} onChange={(e) => setFilter('type', e.target.value)}><option value="">Any type</option>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</FilterSelect>
        </div>
        {loading ? <TableSkeleton cols={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? <EmptyState title="No questions found" message="Try different filters or add a question." action={<Button onClick={openNew}>Add question</Button>} /> : (
          <>
            <Table><thead><tr><Th>Question</Th><Th>Subject</Th><Th>Type</Th><Th>Difficulty</Th><Th>Marks</Th><Th>Used in</Th><Th /></tr></thead>
              <tbody>{data.items.map((r) => (
                <tr key={r.question_id}><Td className="max-w-md"><span className="line-clamp-2">{r.question_text}</span></Td><Td>{r.subject_code}</Td><Td><Badge>{TYPES[r.question_type]}</Badge></Td>
                  <Td><StatusBadge value={r.difficulty} /></Td><Td>{num(r.default_marks)}</Td><Td>{r.used_in_exams} exam{r.used_in_exams === 1 ? '' : 's'}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => openPreview(r)} aria-label={`Preview question ${r.question_id}`}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label={`Edit question ${r.question_id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setArchive(r)} aria-label={`Archive question ${r.question_id}`}><Archive className="h-4 w-4" /></Button></Td></tr>))}</tbody></Table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF((x) => ({ ...x, page: p }))} />
          </>)}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit question' : 'Add question'} wide>
        {v && (
          <form onSubmit={save} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Subject" value={v.subjectId} onChange={(e) => patch({ subjectId: Number(e.target.value) })} error={errs.subjectId}><option value="">Select…</option>{subjects.data?.items.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.code} · {s.name}</option>)}</Select>
              <Select label="Type" value={v.type} onChange={(e) => patch({ type: e.target.value as QType })}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <Select label="Difficulty" value={v.difficulty} onChange={(e) => patch({ difficulty: e.target.value })}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></Select>
              <Input label="Default marks" type="number" min="0.5" step="0.5" value={v.marks} onChange={(e) => patch({ marks: e.target.value })} error={errs.marks} />
            </div>
            <Textarea label="Question" value={v.text} onChange={(e) => patch({ text: e.target.value })} error={errs.text} />
            {v.type === 'MCQ' && (
              <fieldset><legend className="mb-1 text-sm font-medium">Options <span className="font-normal text-muted">(select the correct one)</span></legend>
                <div className="space-y-2">{v.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" aria-label={`Option ${i + 1} is correct`} checked={o.isCorrect} onChange={() => setOpt(i, { isCorrect: true })} className="h-4 w-4 accent-brand-600" />
                    <input aria-label={`Option ${i + 1} text`} value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} placeholder={`Option ${i + 1}`} className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
                    {v.options.length > 2 && <Button type="button" variant="ghost" size="sm" aria-label={`Remove option ${i + 1}`} onClick={() => patch({ options: v.options.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>}
                  </div>))}</div>
                {v.options.length < 6 && <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => patch({ options: [...v.options, { text: '', isCorrect: false }] })}><Plus className="h-4 w-4" aria-hidden />Add option</Button>}
                {errs.options && <p role="alert" className="mt-1 text-xs text-bad">{errs.options}</p>}
              </fieldset>)}
            {v.type === 'TRUE_FALSE' && <Select label="The statement is" value={v.tf} onChange={(e) => patch({ tf: e.target.value as 'true' | 'false' })}><option value="true">True</option><option value="false">False</option></Select>}
            {(v.type === 'SHORT' || v.type === 'DESCRIPTIVE') && <Textarea label="Model answer (staff only)" hint="Shown to students only after results are published." value={v.modelAnswer} onChange={(e) => patch({ modelAnswer: e.target.value })} />}
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" loading={busy}>{form?.id ? 'Save changes' : 'Add question'}</Button></div>
          </form>)}
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Question preview" wide>
        {preview && (<div className="space-y-3"><p className="whitespace-pre-wrap font-medium">{preview.question.question_text}</p>
          {preview.options.length > 0 && <ul className="space-y-2">{preview.options.map((o, i) => (<li key={i} className={`rounded-lg border px-3 py-2 text-sm ${o.is_correct ? 'border-ok/40 bg-ok/10 text-ok' : 'border-line'}`}>{o.option_text}{o.is_correct ? <span className="ml-2 text-xs font-medium">Correct</span> : null}</li>))}</ul>}
          {preview.question.model_answer && <div><p className="text-xs text-muted">Model answer</p><p className="whitespace-pre-wrap text-sm">{preview.question.model_answer}</p></div>}
          <p className="text-xs text-muted">Staff view. Students never receive correct answers while an exam is running.</p></div>)}
      </Modal>

      <ConfirmDialog open={!!archive} danger title="Archive question?" confirmLabel="Archive" loading={busy} onClose={() => setArchive(null)} onConfirm={doArchive}
        message="Archived questions can no longer be added to new examinations. Existing examinations keep them." />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} subjects={subjects.data?.items ?? []} onDone={() => { setImportOpen(false); reload(); }} />
    </>
  );
}

/** CSV columns: text,type,difficulty,marks,optA,optB,optC,optD,correct,modelAnswer. correct = A-D (MCQ) or TRUE/FALSE. Parsed here, validated again on the server. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
function ImportModal({ open, onClose, subjects, onDone }: { open: boolean; onClose: () => void; subjects: Subj[]; onDone: () => void }) {
  const toast = useToast(); const [subjectId, setSubjectId] = useState(''); const [rows, setRows] = useState<unknown[] | null>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const read = async (file?: File) => {
    setMsg(''); setRows(null); if (!file) return;
    const lines = parseCsv(await file.text()); const body = /^text$/i.test(lines[0]?.[0]?.trim()) ? lines.slice(1) : lines;
    try {
      setRows(body.map((c, i) => {
        const type = c[1]?.trim().toUpperCase() as QType;
        if (!['MCQ', 'TRUE_FALSE', 'SHORT', 'DESCRIPTIVE'].includes(type)) throw new Error(`Row ${i + 1}: unknown type "${c[1]}"`);
        const base = { subjectId: Number(subjectId), text: c[0]?.trim(), type, difficulty: (c[2]?.trim().toUpperCase() || 'MEDIUM'), defaultMarks: Number(c[3]) };
        if (type === 'MCQ') { const letters = 'ABCD'; const opts = [c[4], c[5], c[6], c[7]].map((t, k) => ({ text: (t ?? '').trim(), isCorrect: letters[k] === c[8]?.trim().toUpperCase() })).filter((o) => o.text); return { ...base, options: opts }; }
        if (type === 'TRUE_FALSE') return { ...base, trueFalseAnswer: c[8]?.trim().toUpperCase() === 'TRUE' };
        return { ...base, modelAnswer: c[9]?.trim() || null };
      }));
    } catch (e) { setMsg((e as Error).message); }
  };
  const go = async () => {
    setBusy(true);
    try { const r = await api<{ imported: number }>('/questions/import', { body: { questions: rows } }); toast.success(`${r.imported} questions imported`); setRows(null); onDone(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Import questions from CSV" wide>
      <div className="space-y-4 text-sm">
        <p className="text-muted">Columns: <code className="rounded bg-surface-3 px-1">text, type, difficulty, marks, optionA, optionB, optionC, optionD, correct, modelAnswer</code>. For MCQ, <em>correct</em> is A to D; for TRUE_FALSE it is TRUE or FALSE. All rows import together or none do.</p>
        <Select label="Subject for all rows" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setRows(null); }}><option value="">Select…</option>{subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.code} · {s.name}</option>)}</Select>
        <div><label htmlFor="csv" className="mb-1 block font-medium">CSV file</label><input id="csv" type="file" accept=".csv,text/csv" disabled={!subjectId} onChange={(e) => read(e.target.files?.[0])} /></div>
        {msg && <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-bad">{msg}</p>}
        {rows && <p className="text-ok">{rows.length} rows ready to import.</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!rows?.length} loading={busy} onClick={go}>Import</Button></div>
      </div>
    </Modal>
  );
}
