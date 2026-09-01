import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: Number(process.env.ABDX_DEV_PORT || 5173), strictPort: true },
  build: { outDir: 'dist', manifest: true, chunkSizeWarningLimit: 700 }
});
