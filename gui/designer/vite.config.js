import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'],
      manifest: {
        name: 'BodgeGene',
        short_name: 'BG',
        description: 'Visual constructor for genetic assemblies (plasmids).',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fafaf9',
        theme_color: '#f59e0b',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only app shell + small assets. Excluding `json` keeps the
        // 24 MB plasmid pack (`/plasmids-data/*.json` + `plasmids-index.json`
        // + `common-features.json`) out of the first-install download — they
        // fetch on demand below and are CacheFirst from then on.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/plasmids-(index\.json|data\/.+\.json)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'plasmid-pack-v1',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/common-features\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'common-features-v1',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    // Vendor split keeps heavy third-party code in stable chunks so a
    // changed app file doesn't bust React/Dexie/etc. for repeat visitors.
    // Project Flow's @xyflow + dagre + html-to-image cluster lives in its
    // own chunk so it's only fetched if the user actually opens the flow.
    // Rolldown expects a function form (the object form is Rollup-only).
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xyflow') || id.includes('@dagrejs') || id.includes('html-to-image')) return 'xyflow';
          if (id.includes('react-dnd')) return 'dnd';
          if (id.includes('/dexie/') || id.endsWith('/dexie')) return 'db';
          if (id.includes('/fflate/') || id.endsWith('/fflate')) return 'compress';
          if (id.includes('/react-dom/') || id.match(/[\\/]react[\\/]/)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    // Sprint M-X.3 follow-up (05.05.2026) — explicit HMR endpoint.
    // Without these, Vite auto-detects the WS host/port from
    // `location`, which fell over for biolog: «при открытом окне
    // постоянно счетчик ошибок +30 в секунду прибавляет», CPU pegged
    // ~25%. Root cause: stale PWA service worker (or VPN — system
    // has AmneziaVPN + Tailscale installed) intercepted the
    // auto-detected WS URL → handshake failed → ws=undefined → the
    // forwardConsole handler tried to ws.send() → TypeError →
    // unhandled-rejection → forwarder ran again → infinite recursion
    // inside @vite/client. Pinning the URL deterministically makes
    // the failure visible early instead of cascading.
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      clientPort: 3000,
      port: 3000,
    },
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    // M-X.5 K6 (07.05.2026) — switched from default `threads` to `forks`.
    // Symptom: ~half the test files (everything that calls `render()`)
    // started failing with «document is not defined» / `environment 0ms`.
    // Diagnosis: happy-dom cannot initialise inside the worker_threads
    // pool on Windows once the suite is large enough to spawn many
    // workers (resource-limit / fs-handle exhaustion). Forks pool
    // gives each test file its own process — slower (~30%) but
    // reliable. Pre-existing tests that depended on shared module state
    // across workers don't exist in this codebase, so forks is safe.
    pool: 'forks',
  },
})
