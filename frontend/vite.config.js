import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El dev server proxya /api al backend (puerto 3010) para compartir la cookie de sesion.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3010', changeOrigin: true }
    }
  }
});
