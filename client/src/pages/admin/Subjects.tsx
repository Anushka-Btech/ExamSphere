import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { num, pct } from '../../lib/format';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, FilterSelect, Input, Modal, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, Table, TableSkeleton, Td, Textarea, Th } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { useToast } from '../../components/Toast';
import { initialSearch } from '../../lib/format';

interface Row { subject_id: number; code: string; name: string; credits: number; semester: number; status: string; department_code: string; faculty: string | null; exams: number }
interface Dept { department_id: number; code: string; name: string }
const blank = { code: '', name: '', description: '', credits: '3', semester: '3', departmentId: '', status: 'ACTIVE' };

export default function Subjects() {
  const toast = useToast(); const [sp, setSp] = useSearchParams();
  const [f, setF] = useState({ search: initialSearch(), departmentId: '', semester: '', status: '', page: 1 }); const [q, setQ] = useState(initialSearch());
  useEffect(() => { const t = setTimeout(() => setQ(f.search), 300); return () => clearTimeout(t); }, [f.search]);
  const depts = useFetch<{ items: Dept[] }>('/subjects/departments');
  const { data, loading, error, reload } = useFetch<{ items: Row[]; total: number; page: number; pageSize: number }>(`/subjects${qs({ search: q, departmentId: f.departmentId, semester: f.semester, status: f.status, page: f.page, pageSize: 10 })}`);
  const [form, setForm] = useState<{ id: number | null; v: typeof blank } | null>(null); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Row | null>(null); const [view, setView] = useState<number | null>(null);
  useEffect(() => { if (sp.get('new') === '1') { setForm({ id: null, v: blank }); setSp({}, { replace: true }); } }, [sp, setSp]);
  const flt = (k: string, v: string) => setF((p) => ({ ...p, [k]: v, page: 1 }));
  const set = (k: keyof typeof blank, v: string) => setForm((x) => x && { ...x, v: { ...x.v, [k]: v } });

  const openEdit = async (r: Row) => {
    try { const d = await api<{ subject: { code: string; name: string; description: string | null; credits: number; semester: number; department_id: number; status: string } }>(`/subjects/${r.subject_id}`);
      const s = d.subject; setErrs({}); setForm({ id: r.subject_id, v: { code: s.code, name: s.name, description: s.description ?? '', credits: String(s.credits), semester: String(s.semester), departmentId: String(s.department_id), status: s.status } });
    } catch (e) { toast.error((e as Error).message); }
  };
  const validate = (v: typeof blank) => {
    const e: Record<string, string> = {};
    if (v.code.trim().length < 2) e.code = 'Enter a subject code';
    if (v.name.trim().length < 2) e.name = 'Enter the subject name';
    if (!(Number(v.credits) >= 1 && Number(v.credits) <= 10)) e.credits = 'Credits 1-10';
    if (!(Number(v.semester) >= 1 && Number(v.semester) <= 8)) e.semester = 'Semester 1-8';
    if (!v.departmentId) e.departmentId = 'Choose a department';
    return e;
  };
  const save = async (ev: FormEvent) => {
    ev.preventDefault(); if (!form) return; const e = validate(form.v); setErrs(e); if (Object.keys(e).length) return; const v = form.v; setBusy(true);
    const body = { code: v.code.trim(), name: v.name.trim(), description: v.description.trim() || null, credits: Number(v.credits), semester: Number(v.semester), departmentId: Number(v.departmentId), ...(form.id ? { status: v.status } : {}) };
    try { await api(form.id ? `/subjects/${form.id}` : '/subjects', { method: form.id ? 'PUT' : 'POST', body }); toast.success(form.id ? 'Subject updated' : 'Subject created'); setForm(null); reload(); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    if (!del) return; setBusy(true);
    try { await api(`/subjects/${del.subject_id}`, { method: 'DELETE' }); toast.success('Subject deleted'); setDel(null); reload(); }
    catch (e) { toast.error(`${(e as Error).message}. Archive the subject instead (edit it and set the status to Archived).`); setDel(null); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Subjects" subtitle="Courses offered, with their faculty and examinations." actions={<Button onClick={() => { setErrs({}); setForm({ id: null, v: blank }); }}><Plus className="h-4 w-4" aria-hidden />Add subject</Button>} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput placeholder="Search code or name" value={f.search} onChange={(e) => flt('search', e.target.value)} />
          <FilterSelect label="Department" value={f.departmentId} onChange={(e) => flt('departmentId', e.target.value)}><option value="">All departments</option>{depts.data?.items.map((d) => <option key={d.department_id} value={d.department_id}>{d.code}</option>)}</FilterSelect>
          <FilterSelect label="Semester" value={f.semester} onChange={(e) => flt('semester', e.target.value)}><option value="">Any semester</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>Semester {s}</option>)}</FilterSelect>
          <FilterSelect label="Status" value={f.status} onChange={(e) => flt('status', e.target.value)}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></FilterSelect>
        </div>
        {loading ? <TableSkeleton cols={7} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? <EmptyState title="No subjects found" /> : (<>
          <Table><thead><tr><Th>Code</Th><Th>Subject</Th><Th>Dept</Th><Th>Sem</Th><Th>Credits</Th><Th>Faculty</Th><Th>Exams</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{data.items.map((r) => (<tr key={r.subject_id}><Td className="font-medium">{r.code}</Td><Td>{r.name}</Td><Td>{r.department_code}</Td><Td>{r.semester}</Td><Td>{r.credits}</Td><Td className="max-w-[12rem] text-muted"><span className="line-clamp-2">{r.faculty ?? 'Unassigned'}</span></Td><Td>{r.exams}</Td><Td><StatusBadge value={r.status} /></Td>
              <Td className="whitespace-nowrap text-right">
                <Button variant="ghost" size="sm" aria-label={`View ${r.code}`} onClick={() => setView(r.subject_id)}><Eye className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" aria-label={`Edit ${r.code}`} onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" aria-label={`Delete ${r.code}`} onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></Button></Td></tr>))}</tbody></Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF({ ...f, page: p })} /></>)}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit subject' : 'Add subject'}>
        {form && (<form onSubmit={save} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]"><Input label="Code" value={form.v.code} onChange={(e) => set('code', e.target.value)} error={errs.code} /><Input label="Name" value={form.v.name} onChange={(e) => set('name', e.target.value)} error={errs.name} /></div>
          <Textarea label="Description" value={form.v.description} onChange={(e) => set('description', e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-3"><Input label="Credits" type="number" min="1" max="10" value={form.v.credits} onChange={(e) => set('credits', e.target.value)} error={errs.credits} />
            <Input label="Semester" type="number" min="1" max="8" value={form.v.semester} onChange={(e) => set('semester', e.target.value)} error={errs.semester} />
            <Select label="Department" value={form.v.departmentId} onChange={(e) => set('departmentId', e.target.value)} error={errs.departmentId}><option value="">Select…</option>{depts.data?.items.map((d) => <option key={d.department_id} value={d.department_id}>{d.code}</option>)}</Select></div>
          {form.id && <Select label="Status" value={form.v.status} onChange={(e) => set('status', e.target.value)} hint="Archiving keeps all history but hides the subject from new exams."><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></Select>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" loading={busy}>{form.id ? 'Save changes' : 'Create subject'}</Button></div>
        </form>)}
      </Modal>
      <ConfirmDialog open={!!del} danger loading={busy} onClose={() => setDel(null)} onConfirm={doDelete} title="Delete subject?" confirmLabel="Delete"
        message={<>Delete <strong>{del?.code}</strong>? This is refused by the database when examinations or questions reference the subject. In that case archive it instead.</>} />
      {view !== null && <SubjectDetail id={view} onClose={() => setView(null)} />}
    </>
  );
}

function SubjectDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const d = useFetch<{ subject: { code: string; name: string; description: string | null; department_name: string; credits: number; semester: number }; exams: { exam_id: number; title: string; status: string; attempts_total: number; avg_marks: number | null; pass_percentage: number | null; is_published: number }[];
    performance: { published_exams: number; attempts: number; avg_percentage: number | null; pass_percentage: number | null } | null }>(`/subjects/${id}`);
  return (
    <Modal open onClose={onClose} title={d.data ? `${d.data.subject.code} · ${d.data.subject.name}` : 'Subject'} wide>
      {!d.data ? <Skeleton className="h-40" /> : (<div className="space-y-4 text-sm">
        <p className="text-muted">{d.data.subject.department_name} · semester {d.data.subject.semester} · {d.data.subject.credits} credits</p>{d.data.subject.description && <p>{d.data.subject.description}</p>}
        <div className="grid gap-3 sm:grid-cols-3">{[['Published exams', d.data.performance?.published_exams ?? 0], ['Average (published)', pct(d.data.performance?.avg_percentage)], ['Pass rate (published)', pct(d.data.performance?.pass_percentage)]].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg border border-line p-3"><p className="text-xs text-muted">{k}</p><p className="text-lg font-semibold">{v}</p></div>))}</div>
        <h3 className="font-semibold">Examinations</h3>
        {!d.data.exams.length ? <p className="text-muted">No examinations for this subject.</p> : <Table><thead><tr><Th>Title</Th><Th>Status</Th><Th>Attempts</Th><Th>Avg marks</Th></tr></thead>
          <tbody>{d.data.exams.map((e) => (<tr key={e.exam_id}><Td>{e.title}</Td><Td><StatusBadge value={e.status} /></Td><Td>{e.attempts_total}</Td><Td>{num(e.avg_marks)}</Td></tr>))}</tbody></Table>}
      </div>)}
    </Modal>
  );
}
