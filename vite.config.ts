import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed to GitHub Pages at https://<user>.github.io/Rotation-wizard/, so built assets
// must resolve under that sub-path. The dev server stays at '/' for convenience.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Rotation-wizard/' : '/',
  plugins: [react()],
  server: { host: true },
}));
