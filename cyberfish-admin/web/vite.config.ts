import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发代理：/api 与 /files 转发到后端 Fastify（3001）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/files': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
