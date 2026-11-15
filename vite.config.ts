import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative paths so the built app works from any web address, including GitHub Pages.
  base: './',
  plugins: [react()],
  // allowedHosts lets the app open through a preview address as well as localhost.
  server: { host: true, port: 5173, allowedHosts: true },
});
