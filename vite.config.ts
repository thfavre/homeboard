import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

const SERVER = 'http://localhost:4300';

export default defineConfig({
  root: 'web',
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: resolve('web/src/lib'),
      $shared: resolve('shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: SERVER, ws: true },
      '/api': SERVER,
      '/media': SERVER,
    },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        guest: resolve('web/index.html'),
        tv: resolve('web/tv.html'),
        admin: resolve('web/admin.html'),
      },
    },
  },
});
