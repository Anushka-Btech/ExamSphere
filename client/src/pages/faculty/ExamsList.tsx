import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime, num, pct } from '../../lib/format';
import { Button, Card, EmptyState, ErrorState, FilterSelect, PageHeader, Pagination, SearchInput, StatusBadge, Table, TableSkeleton, Td, Th } from '../../components/ui';
import { useFetch } from '../../components/useFetch';

interface Row { exam_id: number; title: string; status: string; scheduled_start: string; duration_minutes: number; max_marks: number; subject_code: string; owner: string;
  attempts_total: number | null; attempts_pending: number | null; avg_marks: number | null; pass_percentage: number | null; is_published: number | null }

/** Used by both roles: the server limits faculty to their own exams; admins see all (read-only). */
export default function ExamsList() {
  const { user } = useAuth(); const base = user?.role === 'ADMIN' ? '/admin' : '/faculty';
  const [f, setF] = useState({ search: '', status: '', page: 1 }); const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(f.search), 300); return () => clearTimeout(t); }, [f.search]);
  const { data, loading, error, reload } = useFetch<{ items: Row[]; total: number; page: number; pageSize: number }>(`/exams${qs({ search: q, status: f.status, page: f.page, pageSize: 10 })}`);
  return (
    <>
      <PageHeader title="Examinations" subtitle={user?.role === 'ADMIN' ? 'All examinations (read-only oversight).' : 'Examinations you own.'}
        actions={user?.role === 'FACULTY' ? <Link to="/faculty/exams/new"><Button><Plus className="h-4 w-4" aria-hidden />New examination</Button></Link> : undefined} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput placeholder="Search by title" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value, page: 1 })} />
          <FilterSelect label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">All statuses</option>
            {['DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</FilterSelect>
        </div>
        {loading ? <TableSkeleton cols={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? <EmptyState title="No examinations found" /> : (<>
          <Table><thead><tr><Th>Examination</Th><Th>Subject</Th><Th>Starts</Th><Th>Status</Th><Th>Attempts</Th><Th>Avg / Pass</Th><Th>Results</Th>{user?.role === 'ADMIN' && <Th>Owner</Th>}</tr></thead>
            <tbody>{data.items.map((e) => (<tr key={e.exam_id}>
              <Td className="font-medium"><Link className="hover:text-brand-600 hover:underline" to={`${base}/exams/${e.exam_id}`}>{e.title}</Link></Td><Td>{e.subject_code}</Td>
              <Td className="whitespace-nowrap text-muted">{fmtDateTime(e.scheduled_start)}</Td><Td><StatusBadge value={e.status} /></Td>
              <Td>{e.attempts_total ?? 0}{e.attempts_pending ? <span className="text-xs text-warn"> ({e.attempts_pending} pending)</span> : null}</Td>
              <Td className="whitespace-nowrap">{num(e.avg_marks)} / {pct(e.pass_percentage)}</Td><Td>{e.is_published ? <StatusBadge value="PUBLISHED" /> : <span className="text-muted">-</span>}</Td>
              {user?.role === 'ADMIN' && <Td>{e.owner}</Td>}</tr>))}</tbody></Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF({ ...f, page: p })} /></>)}
      </Card>
    </>
  );
}
