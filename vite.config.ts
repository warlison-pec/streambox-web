import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Em desenvolvimento, os mesmos caminhos do nginx de produção são repassados:
//   /api      -> Jellyfin
//   /strm-api -> STRM Indexer (ponte /jf)
//   /seerr    -> Seerr/Jellyseerr
const JELLYFIN = process.env.JELLYFIN_URL ?? 'http://127.0.0.1:8096';
const INDEXER = process.env.INDEXER_URL ?? 'http://127.0.0.1:8794';
const SEERR = process.env.SEERR_URL ?? 'http://127.0.0.1:5055';

export default defineConfig({
  plugins: [svelte()],
  build: { target: 'es2020', chunkSizeWarningLimit: 600 },
  server: {
    proxy: {
      '/api': { target: JELLYFIN, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/strm-api': { target: INDEXER, changeOrigin: true },
      '/seerr': { target: SEERR, changeOrigin: true, rewrite: (p) => p.replace(/^\/seerr/, '') },
    },
  },
});
