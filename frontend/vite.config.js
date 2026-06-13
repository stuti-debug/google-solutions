import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/data': 'http://127.0.0.1:8000',
      '/match': 'http://127.0.0.1:8000',
      '/status': 'http://127.0.0.1:8000',
      '/stats': 'http://127.0.0.1:8000',
      '/nlq': 'http://127.0.0.1:8000',
      '/query': 'http://127.0.0.1:8000',
      '/clean': 'http://127.0.0.1:8000',
      '/priority': 'http://127.0.0.1:8000',
      '/alerts': 'http://127.0.0.1:8000',
      '/forecast': 'http://127.0.0.1:8000',
      '/insights': 'http://127.0.0.1:8000',
      '/export': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/reports': 'http://127.0.0.1:8000',
      '/sitrep': 'http://127.0.0.1:8000',
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/data': 'http://127.0.0.1:8000',
      '/match': 'http://127.0.0.1:8000',
      '/status': 'http://127.0.0.1:8000',
      '/stats': 'http://127.0.0.1:8000',
      '/nlq': 'http://127.0.0.1:8000',
      '/query': 'http://127.0.0.1:8000',
      '/clean': 'http://127.0.0.1:8000',
      '/priority': 'http://127.0.0.1:8000',
      '/alerts': 'http://127.0.0.1:8000',
      '/forecast': 'http://127.0.0.1:8000',
      '/insights': 'http://127.0.0.1:8000',
      '/export': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/reports': 'http://127.0.0.1:8000',
      '/sitrep': 'http://127.0.0.1:8000',
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'CrisisGrid Logistics & Disaster Relief',
        short_name: 'CrisisGrid',
        description: 'Premium AI-driven disaster response and supply chain matching platform.',
        theme_color: '#0d7377',
        background_color: '#0a0f1d',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4000000,
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webformats',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /.*\/data\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-data-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
})
