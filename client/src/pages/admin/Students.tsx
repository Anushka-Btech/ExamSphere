import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { api, ApiError, qs } from '../../lib/api';
import { fmtDate, num, pct } from '../../lib/format';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, FilterSelect, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, Table, TableSkeleton, Td, Th } from '../../components/ui';
import { useFetch } from '../../components/useFetch';
import { useToast } from '../../components/Toast';
import { initialSearch } from '../../lib/format';

interface Row { user_id: number; full_name: string; email: string; username: string; status: string; enrollment_no: string; semester: number; enrollment_date: string; department_id: number; department_code: string }
interface Dept { department_id: number; code: string; name: string }
const blank = { fullName: '', email: '', username: '', password: '', enrollmentNo: '', departmentId: '', semester: '3', enrollmentDate: new Date().toISOString().slice(0, 10) };

export default function Students() {
  const toast = useToast(); const [sp, setSp] = useSearchParams();
  const [f, setF] = useState({ search: initialSearch(), departmentId: '', semester: '', status: '', page: 1 }); const [q, setQ] = useState(initialSearch());
  useEffect(() => { const t = setTimeout(() => setQ(f.search), 300); return () => clearTimeout(t); }, [f.search]);
  const depts = useFetch<{ items: Dept[] }>('/subjects/departments');
  const { data, loading, error, reload } = useFetch<{ items: Row[]; total: number; page: number; pageSize: number }>(`/admin/students${qs({ search: q, departmentId: f.departmentId, semester: f.semester, status: f.status, page: f.page, pageSize: 10 })}`);
  const [form, setForm] = useState<{ id: number | null; v: typeof blank } | null>(null); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState<Row | null>(null); const [view, setView] = useState<number | null>(null);
  useEffect(() => { if (sp.get('new') === '1') { setForm({ id: null, v: blank }); setSp({}, { replace: true }); } }, [sp, setSp]);
  const flt = (k: string, v: string) => setF((p) => ({ ...p, [k]: v, page: 1 }));
  const set = (k: keyof typeof blank, v: string) => setForm((x) => x && { ...x, v: { ...x.v, [k]: v } });

  const validate = (v: typeof blank, isNew: boolean) => {
    const e: Record<string, string> = {};
    if (v.fullName.trim().length < 2) e.fullName = 'Enter the full name';
    if (!/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Enter a valid email';
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(v.username)) e.username = '3-50 characters: letters, digits, . _ -';
    if (isNew && v.password.length < 8) e.password = 'At least 8 characters';
    if (v.enrollmentNo.trim().length < 4) e.enrollmentNo = 'Enter the enrollment number';
    if (!v.departmentId) e.departmentId = 'Choose a department';
    return e;
  };
  const save = async (ev: FormEvent) => {
    ev.preventDefault(); if (!form) return; const isNew = form.id === null; const e = validate(form.v, isNew); setErrs(e); if (Object.keys(e).length) return;
    const v = form.v; setBusy(true);
    const body = { fullName: v.fullName.trim(), email: v.email.trim().toLowerCase(), username: v.username.trim(), enrollmentNo: v.enrollmentNo.trim(), departmentId: Number(v.departmentId), semester: Number(v.semester), enrollmentDate: v.enrollmentDate, ...(isNew ? { password: v.password } : {}) };
    try { await api(isNew ? '/admin/students' : `/admin/students/${form.id}`, { method: isNew ? 'POST' : 'PATCH', body }); toast.success(isNew ? 'Student added' : 'Student updated'); setForm(null); reload(); }
    catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrs({ enrollmentNo: 'Email, username or enrollment number is already in use' }); // duplicate prevented by DB unique constraints
      else toast.error((err as Error).message);
    } finally { setBusy(false); }
  };
  const flip = async () => {
    if (!toggle) return; setBusy(true);
    try { await api(`/admin/students/${toggle.user_id}`, { method: 'PATCH', body: { status: toggle.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }); toast.success(toggle.status === 'ACTIVE' ? 'Student deactivated' : 'Student reactivated'); setToggle(null); reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const edit = (r: Row) => { setErrs({}); setForm({ id: r.user_id, v: { fullName: r.full_name, email: r.email, username: r.username, password: '', enrollmentNo: r.enrollment_no, departmentId: String(r.department_id), semester: String(r.semester), enrollmentDate: r.enrollment_date.slice(0, 10) } }); };

  return (
    <>
      <PageHeader title="Students" subtitle="Accounts and enrollment details." actions={<Button onClick={() => { setErrs({}); setForm({ id: null, v: blank }); }}><Plus className="h-4 w-4" aria-hidden />Add student</Button>} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput placeholder="Search name, email or enrollment no." value={f.search} onChange={(e) => flt('search', e.target.value)} />
          <FilterSelect label="Department" value={f.departmentId} onChange={(e) => flt('departmentId', e.target.value)}><option value="">All departments</option>{depts.data?.items.map((d) => <option key={d.department_id} value={d.department_id}>{d.code}</option>)}</FilterSelect>
          <FilterSelect label="Semester" value={f.semester} onChange={(e) => flt('semester', e.target.value)}><option value="">All semesters</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>Semester {s}</option>)}</FilterSelect>
          <FilterSelect label="Status" value={f.status} onChange={(e) => flt('status', e.target.value)}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></FilterSelect>
        </div>
        {loading ? <TableSkeleton cols={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? <EmptyState title="No students found" message="Adjust the filters or add a student." /> : (<>
          <Table><thead><tr><Th>Name</Th><Th>Enrollment no.</Th><Th>Department</Th><Th>Sem</Th><Th>Enrolled</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{data.items.map((r) => (<tr key={r.user_id}><Td><p className="font-medium">{r.full_name}</p><p className="text-xs text-muted">{r.email}</p></Td><Td>{r.enrollment_no}</Td><Td>{r.department_code}</Td><Td>{r.semester}</Td><Td>{fmtDate(r.enrollment_date)}</Td><Td><StatusBadge value={r.status} /></Td>
              <Td className="whitespace-nowrap text-right"><Button variant="ghost" size="sm" aria-label={`View ${r.full_name}`} onClick={() => setView(r.user_id)}><Eye className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" aria-label={`Edit ${r.full_name}`} onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" aria-label={`${r.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'} ${r.full_name}`} onClick={() => setToggle(r)}>{r.status === 'ACTIVE' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}</Button></Td></tr>))}</tbody></Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF((x) => ({ ...x, page: p }))} /></>)}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit student' : 'Add student'} wide>
        {form && (<form onSubmit={save} noValidate className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" value={form.v.fullName} onChange={(e) => set('fullName', e.target.value)} error={errs.fullName} />
          <Input label="Enrollment number" value={form.v.enrollmentNo} onChange={(e) => set('enrollmentNo', e.target.value)} error={errs.enrollmentNo} />
          <Input label="Email" type="email" value={form.v.email} onChange={(e) => set('email', e.target.value)} error={errs.email} />
          <Input label="Username" value={form.v.username} onChange={(e) => set('username', e.target.value)} error={errs.username} />
          {!form.id && <Input label="Initial password" type="password" autoComplete="new-password" value={form.v.password} onChange={(e) => set('password', e.target.value)} error={errs.password} hint="The student can sign in with this." />}
          <Select label="Department" value={form.v.departmentId} onChange={(e) => set('departmentId', e.target.value)} error={errs.departmentId}><option value="">Select…</option>{depts.data?.items.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}</Select>
          <Select label="Semester" value={form.v.semester} onChange={(e) => set('semester', e.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <Input label="Enrollment date" type="date" value={form.v.enrollmentDate} onChange={(e) => set('enrollmentDate', e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" loading={busy}>{form.id ? 'Save changes' : 'Add student'}</Button></div></form>)}
      </Modal>
      <ConfirmDialog open={!!toggle} danger={toggle?.status === 'ACTIVE'} loading={busy} onClose={() => setToggle(null)} onConfirm={flip} title={toggle?.status === 'ACTIVE' ? 'Deactivate student?' : 'Reactivate student?'} confirmLabel={toggle?.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        message={toggle?.status === 'ACTIVE' ? `${toggle.full_name} will be signed out and unable to log in. Their records are kept.` : `${toggle?.full_name} will be able to sign in again.`} />
      {view !== null && <StudentView id={view} onClose={() => setView(null)} />}
    </>
  );
}

function StudentView({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, loading, error } = useFetch<{ student: { full_name: string; email: string; enrollment_no: string; department_name: string; semester: number; last_login_at: string | null }; attempts: { exam_id: number; exam_title: string; total_marks: number; max_marks: number; percentage: number; result: string | null; result_state: string }[] }>(`/admin/students/${id}`);
  return (
    <Modal open onClose={onClose} title={data?.student.full_name ?? 'Student'} wide>
      {loading ? <TableSkeleton rows={3} cols={3} /> : error || !data ? <ErrorState message={error ?? 'Not found'} /> : (<div className="space-y-4 text-sm">
        <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted">Email</dt><dd>{data.student.email}</dd></div><div><dt className="text-xs text-muted">Enrollment no.</dt><dd>{data.student.enrollment_no}</dd></div>
          <div><dt className="text-xs text-muted">Department / semester</dt><dd>{data.student.department_name} · {data.student.semester}</dd></div><div><dt className="text-xs text-muted">Last sign-in</dt><dd>{data.student.last_login_at ?? 'Never'}</dd></div></dl>
        <h3 className="font-semibold">Examination history</h3>
        {!data.attempts.length ? <EmptyState title="No attempts yet" /> : <Table><thead><tr><Th>Examination</Th><Th>Marks</Th><Th>%</Th><Th>State</Th></tr></thead><tbody>{data.attempts.map((a) => (<tr key={a.exam_id}><Td>{a.exam_title}</Td><Td>{a.result ? `${num(a.total_marks)} / ${num(a.max_marks)}` : 'Pending'}</Td><Td>{a.result ? pct(a.percentage) : '-'}</Td><Td><StatusBadge value={a.result_state} /></Td></tr>))}</tbody></Table>}</div>)}
    </Modal>
  );
}
