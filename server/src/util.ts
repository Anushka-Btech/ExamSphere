import { z } from 'zod';

export const idParam = z.coerce.number().int().positive();

/** ?page=1&pageSize=10 -> validated LIMIT/OFFSET. pageSize is capped so a client cannot request the whole table. */
export function paging(q: Record<string, unknown>) {
  const p = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(10) }).parse(q);
  return { page: p.page, pageSize: p.pageSize, offset: (p.page - 1) * p.pageSize };
}
/** Escapes LIKE wildcards in user search text so "%" or "_" are matched literally. */
export const like = (s: string) => `%${s.replace(/[\\%_]/g, (m) => '\\' + m)}%`;

export const password = z.string().min(8, 'At least 8 characters').max(100);
