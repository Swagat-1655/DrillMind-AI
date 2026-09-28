import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The DrillMind API is proxied so the browser only ever talks to its own
 * origin: no CORS preflight, no API base URL to configure, and the Groq key
 * stays server-side inside the FastAPI process.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.DRILLMIND_API ?? 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          // Server-Sent Events must stream straight through, never buffered.
          ws: false,
          configure(proxy) {
            proxy.on('proxyRes', (proxyRes) => {
              if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
                proxyRes.headers['cache-control'] = 'no-cache, no-transform';
                proxyRes.headers['x-accel-buffering'] = 'no';
              }
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) return 'leaflet';
            if (id.includes('node_modules/react')) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
