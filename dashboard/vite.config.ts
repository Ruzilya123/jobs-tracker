import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' — чтобы сборка работала и на GitHub Pages (/job-tracker/), и на своём поддомене
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: ['..'] },
  },
});
