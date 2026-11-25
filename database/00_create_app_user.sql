-- Run ONCE as a MySQL admin before `npm run db:setup`.  Replace CHANGE_ME, and use the same value as DB_PASSWORD in server/.env.
-- The application connects as this least-privilege user, never as root.
CREATE USER IF NOT EXISTS 'examsphere_app'@'localhost' IDENTIFIED BY 'CHANGE_ME';
GRANT SELECT, INSERT, UPDATE, DELETE ON examsphere_db.* TO 'examsphere_app'@'localhost';
-- (The privilege survives db:setup, which drops and recreates the database.)
FLUSH PRIVILEGES;
