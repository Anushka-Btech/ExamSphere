import { defineConfig } from 'vitest/config';
// Tests share one database and run in order, so no parallel files.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 20000, hookTimeout: 20000 } });
