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
        theme_color: '#faf9f5',
        background_color: '#faf9f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/clanki/',
        scope: '/clanki/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
