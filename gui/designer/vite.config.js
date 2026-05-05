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
  },
})
