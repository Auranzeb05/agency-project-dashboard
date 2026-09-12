import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig(({ command }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development'),
  },
  plugins: [react()],
  envDir: '../..',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'socket.io-client'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:4000',
      '/socket.io': { target: process.env.API_PROXY_TARGET || 'http://localhost:4000', ws: true },
    },
  },
}));
