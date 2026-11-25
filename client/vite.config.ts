import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser only talks to this origin; /api is proxied to Express, so the session cookie is same-site.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } } },
});
