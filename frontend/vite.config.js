import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom src/sw.js instead of the auto-generated one — needed for the
      // push/notificationclick listeners that make emergency-alert push
      // notifications actually show up and deep-link correctly.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
      includeAssets: ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'logo-mark.svg'],
      manifest: {
        name: 'Safetee — Personal Safety',
        short_name: 'Safetee',
        description: 'One-touch SOS, live location sharing, journey monitoring and trusted contacts — ready in seconds.',
        start_url: '/',
        display: 'standalone',
        background_color: '#060A0F',
        theme_color: '#060A0F',
        orientation: 'portrait-primary',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
