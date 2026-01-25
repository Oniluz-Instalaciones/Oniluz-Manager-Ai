import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Eliminamos proxy local para evitar conflictos en Vercel
  // Vercel maneja las rutas API a través de vercel.json
});