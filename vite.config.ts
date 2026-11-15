import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // allowedHosts lets the app open through a preview address as well as localhost.
  server: { host: true, port: 5173, allowedHosts: true },
});
