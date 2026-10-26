import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

const SERVER = `http://localhost:${process.env.PORT ?? 4300}`;

export default defineConfig({
  root: 'web',
  plugins: [
    svelte(),
    {
      // Same pretty URLs as the production server
      name: 'homeboard-pages',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const [path, query] = (req.url ?? '').split('?');
          if (path === '/tv' || path === '/admin') req.url = `${path}.html${query ? `?${query}` : ''}`;
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      $lib: resolve('web/src/lib'),
      $shared: resolve('shared'),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
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
