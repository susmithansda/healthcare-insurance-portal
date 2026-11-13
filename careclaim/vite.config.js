import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { output: { manualChunks(id) {
    if (!id.includes('node_modules')) return;
    if (/recharts|d3-|victory|@reduxjs|react-redux|reselect|immer/.test(id)) return 'charts';
    if (/react-dom|react-router|[\\/]react[\\/]|scheduler/.test(id)) return 'react';
  } } } },
  server: { proxy: { '/api': process.env.CARECLAIM_API_TARGET || 'http://127.0.0.1:4000' } },
});
