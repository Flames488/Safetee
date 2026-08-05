import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
      workbox: {
        // App-shell precaching only — journeys/SOS/contacts all need a live
        // network round-trip to be trustworthy, so none of that is cached.
        // This makes the app installable and lets it load instantly on
        // repeat visits; it deliberately does not promise offline SOS
        // triggering, which would be dishonest for a safety app to imply.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
