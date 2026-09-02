import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const localThreeModule = path.resolve(
  projectRoot,
  'source/threejs-transmission/build/three.module.js',
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: localThreeModule,
      },
    ],
  },
  optimizeDeps: {
    exclude: ['three', 'three/addons/loaders/GLTFLoader.js'],
  },
  server: {
    host: '127.0.0.1',
  },
});

