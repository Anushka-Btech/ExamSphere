import { exec, type Conn, pool } from './db.js';

/** Append a row to audit_logs. Pass the transaction connection to make it atomic with the change. */
export async function audit(actorId: number | null, action: string, entityType: string, entityId: number | null,
  details: unknown = null, c: Conn = pool) {
  await exec('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)',
    [actorId, action, entityType, entityId, details === null ? null : JSON.stringify(details)], c);
}
