import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Library build: one ES module, react left external (peer dep), unminified +
 * sourcemapped so consumers' bundlers decide minification.
 * Type declarations are emitted by tsconfig.build.json.
 */
export default defineConfig({
  plugins: [react()],
  // The playground's public/ assets (song.mp3, favicons) are demo data and
  // must NOT ship inside the library tarball.
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: [/^react(?:\/|$)/, /^react-dom(?:\/|$)/],
    },
  },
});
