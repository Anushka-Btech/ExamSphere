import { createApp } from './app.js';
import { config } from './config.js';
import { finalizeExpiredAttempts, syncExamStatuses } from './examEngine.js';
import { exec } from './db.js';

const app = createApp();
app.listen(config.port, () => console.log(`ExamSphere API on http://localhost:${config.port}`));

// Housekeeping every 30s. Correctness never depends on it (reads/writes re-check the clock); it just keeps data tidy.
setInterval(() => {
  syncExamStatuses().then(finalizeExpiredAttempts)
    .then(() => exec('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()'))
    .catch((e) => console.error('housekeeping failed', e));
}, 30_000);
