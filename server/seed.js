// Creates/refreshes the database: runs 01_schema.sql, loads 02_seed.sql with REAL bcrypt hashes, then 03_views.sql.
//   npm run db:setup          (WARNING: drops and recreates examsphere_db - demo data only)
// The seed SQL contains __HASH_ADMIN__/__HASH_FACULTY__/__HASH_STUDENT__ placeholders; this script hashes the demo
// passwords from .env (bcrypt, cost 10, random salt per hash) and substitutes them in memory. Nothing plaintext is stored.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const pw = {
  ADMIN: process.env.DEMO_ADMIN_PASSWORD ?? 'Admin@123',
  FACULTY: process.env.DEMO_FACULTY_PASSWORD ?? 'Faculty@123',
  STUDENT: process.env.DEMO_STUDENT_PASSWORD ?? 'Student@123',
};

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_ADMIN_USER ?? 'root', password: process.env.DB_ADMIN_PASSWORD ?? '',
  multipleStatements: true, timezone: 'Z',
});

try {
  console.log('1/3 schema ...');   await conn.query(read('01_schema.sql'));
  console.log('2/3 seed data ...');
  let seed = read('02_seed.sql');
  for (const role of Object.keys(pw)) seed = seed.replaceAll(`__HASH_${role}__`, await bcrypt.hash(pw[role], 10));
  await conn.query(seed);
  console.log('3/3 views ...');    await conn.query(read('03_views.sql'));
  console.log('Done. Demo logins: admin / meera.iyer / aarav.sharma (see README for passwords).');
} finally {
  await conn.end();
}
