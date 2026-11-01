import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: {
    target: 'es2022',
    // ES2022 targets support module scripts. Preload remains an optional native
    // optimization; importing modules works without a duplicate fetch polyfill.
    modulePreload: { polyfill: false },
    sourcemap: false,
    manifest: true,
    cssMinify: 'lightningcss',
    minify: 'terser',
    terserOptions: { ecma: 2022, compress: { passes: 2 }, maxWorkers: 2 },
    rollupOptions: { input: { app: 'index.html', admin: 'admin.html' } },
  },
});
