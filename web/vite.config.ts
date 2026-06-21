import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em dev, /api → API Fastify (127.0.0.1:8088), removendo o prefixo /api.
// Em produção o nginx faz o mesmo proxy, então o client usa sempre base "/api".
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8088',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
