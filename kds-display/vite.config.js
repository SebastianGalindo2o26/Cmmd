import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kds/',
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
