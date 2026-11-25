import { useEffect, useState, type FormEvent } from 'react';
import { Eye, Pencil, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { num, pct } from '../../lib/format';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, FilterSelect, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, Table, TableSkeleton, Td, Th, Skeleton } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { useToast } from '../../components/Toast';
import { initialSearch } from '../../lib/format';

interface Row { user_id: number; full_name: string; email: string; status: string; employee_code: string; designation: string; department_code: string; subjects: number; exams: number }
interface Dept { department_id: number; code: string; name: string }
const blank = { fullName: '', email: '', username: '', password: '', employeeCode: '', designation: '', departmentId: '' };

export default function Faculty() {
  const toast = useToast();
  const [f, setF] = useState({ search: initialSearch(), departmentId: '', status: '', page: 1 }); const [q, setQ] = useState(initialSearch());
  useEffect(() => { const t = setTimeout(() => setQ(f.search), 300); return () => clearTimeout(t); }, [f.search]);
  const depts = useFetch<{ items: Dept[] }>('/subjects/departments');
  const { data, loading, error, reload } = useFetch<{ items: Row[]; total: number; page: number; pageSize: number }>(`/admin/faculty${qs({ search: q, departmentId: f.departmentId, status: f.status, page: f.page, pageSize: 10 })}`);
  const [form, setForm] = useState<{ id: number | null; v: typeof blank } | null>(null); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState<Row | null>(null); const [view, setView] = useState<number | null>(null);
  const flt = (k: string, v: string) => setF((p) => ({ ...p, [k]: v, page: 1 }));
  const set = (k: keyof typeof blank, v: string) => setForm((x) => x && { ...x, v: { ...x.v, [k]: v } });

  const openEdit = async (r: Row) => {
    try {
      const d = await api<{ faculty: { full_name: string; email: string; employee_code: string; designation: string } }>(`/admin/faculty/${r.user_id}`);
      const dep = depts.data?.items.find((x) => x.code === r.department_code);
      setErrs({}); setForm({ id: r.user_id, v: { ...blank, fullName: d.faculty.full_name, email: d.faculty.email, username: '', employeeCode: d.faculty.employee_code, designation: d.faculty.designation, departmentId: String(dep?.department_id ?? '') } });
    } catch (e) { toast.error((e as Error).message); }
  };
  const validate = (v: typeof blank, isNew: boolean) => {
    const e: Record<string, string> = {};
    if (v.fullName.trim().length < 2) e.fullName = 'Enter the full name';
    if (!/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Enter a valid email';
    if (isNew && !/^[a-zA-Z0-9._-]{3,50}$/.test(v.username)) e.username = '3-50 characters: letters, digits, . _ -';
    if (isNew && v.password.length < 8) e.password = 'At least 8 characters';
    if (v.employeeCode.trim().length < 3) e.employeeCode = 'Enter the employee code';
    if (v.designation.trim().length < 2) e.designation = 'Enter the designation';
    if (!v.departmentId) e.departmentId = 'Choose a department';
    return e;
  };
  const save = async (ev: FormEvent) => {
    ev.preventDefault(); if (!form) return; const isNew = form.id === null; const e = validate(form.v, isNew); setErrs(e); if (Object.keys(e).length) return;
    const v = form.v; setBusy(true);
    const body = { fullName: v.fullName.trim(), email: v.email.trim().toLowerCase(), employeeCode: v.employeeCode.trim(), designation: v.designation.trim(), departmentId: Number(v.departmentId), ...(isNew ? { username: v.username.trim(), password: v.password } : {}) };
    try { await api(isNew ? '/admin/faculty' : `/admin/faculty/${form.id}`, { method: isNew ? 'POST' : 'PATCH', body }); toast.success(isNew ? 'Faculty member added' : 'Faculty member updated'); setForm(null); reload(); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const doToggle = async () => {
    if (!toggle) return; setBusy(true);
    try { await api(`/admin/faculty/${toggle.user_id}`, { method: 'PATCH', body: { status: toggle.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }); toast.success('Status updated'); setToggle(null); reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Faculty" subtitle="Faculty members, their subjects and examinations." actions={<Button onClick={() => { setErrs({}); setForm({ id: null, v: blank }); }}><Plus className="h-4 w-4" aria-hidden />Add faculty</Button>} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput placeholder="Search name, email or code" value={f.search} onChange={(e) => flt('search', e.target.value)} />
          <FilterSelect label="Department" value={f.departmentId} onChange={(e) => flt('departmentId', e.target.value)}><option value="">All departments</option>{depts.data?.items.map((d) => <option key={d.department_id} value={d.department_id}>{d.code}</option>)}</FilterSelect>
          <FilterSelect label="Status" value={f.status} onChange={(e) => flt('status', e.target.value)}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></FilterSelect>
        </div>
        {loading ? <TableSkeleton cols={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? <EmptyState title="No faculty found" /> : (<>
          <Table><thead><tr><Th>Name</Th><Th>Code</Th><Th>Department</Th><Th>Subjects</Th><Th>Exams</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{data.items.map((r) => (<tr key={r.user_id}><Td className="font-medium">{r.full_name}<div className="text-xs font-normal text-muted">{r.designation} · {r.email}</div></Td><Td>{r.employee_code}</Td><Td>{r.department_code}</Td><Td>{r.subjects}</Td><Td>{r.exams}</Td><Td><StatusBadge value={r.status} /></Td>
              <Td className="whitespace-nowrap text-right">
                <Button variant="ghost" size="sm" aria-label={`View ${r.full_name}`} onClick={() => setView(r.user_id)}><Eye className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" aria-label={`Edit ${r.full_name}`} onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" aria-label={r.status === 'ACTIVE' ? `Deactivate ${r.full_name}` : `Activate ${r.full_name}`} onClick={() => setToggle(r)}>{r.status === 'ACTIVE' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}</Button></Td></tr>))}</tbody></Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF({ ...f, page: p })} /></>)}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit faculty member' : 'Add faculty member'}>
        {form && (<form onSubmit={save} noValidate className="space-y-4">
          <Input label="Full name" value={form.v.fullName} onChange={(e) => set('fullName', e.target.value)} error={errs.fullName} />
          <Input label="Email" type="email" value={form.v.email} onChange={(e) => set('email', e.target.value)} error={errs.email} />
          {form.id === null && <div className="grid gap-4 sm:grid-cols-2"><Input label="Username" value={form.v.username} onChange={(e) => set('username', e.target.value)} error={errs.username} /><Input label="Initial password" type="password" autoComplete="new-password" value={form.v.password} onChange={(e) => set('password', e.target.value)} error={errs.password} /></div>}
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Employee code" value={form.v.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} error={errs.employeeCode} /><Input label="Designation" value={form.v.designation} onChange={(e) => set('designation', e.target.value)} error={errs.designation} /></div>
          <Select label="Department" value={form.v.departmentId} onChange={(e) => set('departmentId', e.target.value)} error={errs.departmentId}><option value="">Select…</option>{depts.data?.items.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}</Select>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" loading={busy}>{form.id ? 'Save changes' : 'Add faculty'}</Button></div>
        </form>)}
      </Modal>
      <ConfirmDialog open={!!toggle} danger={toggle?.status === 'ACTIVE'} loading={busy} onClose={() => setToggle(null)} onConfirm={doToggle}
        title={toggle?.status === 'ACTIVE' ? 'Deactivate faculty member?' : 'Activate faculty member?'} confirmLabel={toggle?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        message={toggle?.status === 'ACTIVE' ? `${toggle?.full_name} will be signed out and unable to log in. Their examinations and records are kept.` : `${toggle?.full_name} will be able to log in again.`} />
      {view !== null && <FacultyProfile id={view} onClose={() => setView(null)} />}
    </>
  );
}

function FacultyProfile({ id, onClose }: { id: number; onClose: () => void }) {
  const toast = useToast();
  const d = useFetch<{ faculty: { full_name: string; email: string; employee_code: string; designation: string; department_name: string }; subjects: { subject_id: number; code: string; name: string }[];
    exams: { exam_id: number; title: string; status: string; attempts_total: number; avg_marks: number | null; pass_percentage: number | null; is_published: number }[] }>(`/admin/faculty/${id}`);
  const all = useFetch<{ items: { subject_id: number; code: string; name: string }[] }>('/subjects?status=ACTIVE&pageSize=100');
  const [pick, setPick] = useState('');
  const assign = async () => { try { await api(`/admin/faculty/${id}/subjects/${pick}`, { method: 'PUT' }); toast.success('Subject assigned'); setPick(''); d.reload(); } catch (e) { toast.error((e as Error).message); } };
  const remove = async (sid: number) => { try { await api(`/admin/faculty/${id}/subjects/${sid}`, { method: 'DELETE' }); toast.success('Assignment removed'); d.reload(); } catch (e) { toast.error((e as Error).message); } };
  const free = all.data?.items.filter((s) => !d.data?.subjects.some((x) => x.subject_id === s.subject_id)) ?? [];
  return (
    <Modal open onClose={onClose} title={d.data?.faculty.full_name ?? 'Faculty profile'} wide>
      {!d.data ? <Skeleton className="h-40" /> : (<div className="space-y-5 text-sm">
        <p className="text-muted">{d.data.faculty.designation} · {d.data.faculty.department_name} · {d.data.faculty.employee_code} · {d.data.faculty.email}</p>
        <section><h3 className="mb-2 font-semibold">Assigned subjects</h3>
          {!d.data.subjects.length ? <p className="text-muted">None yet. A faculty member can only create questions and exams for assigned subjects.</p> : <ul className="space-y-1.5">{d.data.subjects.map((s) => (
            <li key={s.subject_id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2"><span>{s.code} · {s.name}</span><Button variant="ghost" size="sm" aria-label={`Remove ${s.code}`} onClick={() => remove(s.subject_id)}><Trash2 className="h-4 w-4" /></Button></li>))}</ul>}
          <div className="mt-3 flex gap-2"><select aria-label="Subject to assign" value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 rounded-lg border border-line px-3 py-2"><option value="">Assign a subject…</option>{free.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.code} · {s.name}</option>)}</select>
            <Button disabled={!pick} onClick={assign}>Assign</Button></div></section>
        <section><h3 className="mb-2 font-semibold">Examination statistics</h3>
          {!d.data.exams.length ? <p className="text-muted">No examinations yet.</p> : <Table><thead><tr><Th>Exam</Th><Th>Status</Th><Th>Attempts</Th><Th>Avg</Th><Th>Pass</Th></tr></thead>
            <tbody>{d.data.exams.map((e) => (<tr key={e.exam_id}><Td>{e.title}</Td><Td><StatusBadge value={e.status} /></Td><Td>{e.attempts_total}</Td><Td>{num(e.avg_marks)}</Td><Td>{pct(e.pass_percentage)}</Td></tr>))}</tbody></Table>}</section>
      </div>)}
    </Modal>
  );
}
