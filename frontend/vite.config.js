import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Vercel sets VERCEL_GIT_COMMIT_SHA in the build environment automatically
  // (no dashboard config needed) but only VITE_-prefixed vars are exposed to
  // client code — this bridges the two so Settings can show which build is
  // actually live, the one thing that was impossible to tell apart from a
  // real bug without dashboard/SSH access to either Vercel or Render.
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || ''),
  },
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
      includeAssets: ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'logo-mark.png'],
      manifest: {
        // Chrome uses id (falling back to start_url) to decide whether this
        // is the *same* installable app across visits/updates. Leaving it
        // unset works most of the time, but an explicit id is what the spec
        // actually recommends for a reliable "real app install" (a full
        // WebAPK on Android) rather than the lighter "Add to Home screen"
        // bookmark-shortcut fallback some browsers use when any
        // installability signal is ambiguous.
        id: '/',
        name: 'Safetee — Personal Safety',
        short_name: 'Safetee',
        description: 'One-touch SOS, live location sharing, journey monitoring and trusted contacts — ready in seconds.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        background_color: '#060A0F',
        theme_color: '#060A0F',
        orientation: 'portrait-primary',
        categories: ['lifestyle', 'utilities', 'safety'],
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
