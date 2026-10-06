import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /clanki/ (the repo name).
export default defineConfig({
  base: '/clanki/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Clanki',
        short_name: 'Clanki',
        description: 'Spaced-repetition flashcards with a runner game between cards.',
        // Android's launch screen: the icon on this colour, so match the icon's dark tile.
        theme_color: '#1a110b',
        background_color: '#1a110b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/clanki/',
        scope: '/clanki/',
        icons: [
          // Rounded corners with transparent edges for desktop (Windows shows icons as they are);
          // full-bleed squares for Android, which cuts its own shape.
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fonts too, so the serif headings work offline. Only the Latin subsets are needed.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}', '**/*latin-*.woff2'],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
