import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: "esnext", outDir: '../app/src/main/assets/viewer', emptyOutDir: true } });
