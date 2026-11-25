import 'dotenv/config';

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 4000),
  isProd: process.env.NODE_ENV === 'production',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  sessionHours: num(process.env.SESSION_HOURS, 8),
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'examsphere_db',
  },
  /** Grace for network latency when an answer arrives right at the deadline. */
  deadlineGraceSeconds: 5,
};
