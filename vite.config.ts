import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev/demo build of the playground app (src/App.tsx).
// The library itself builds via vite.lib.config.ts into dist/.
export default defineConfig({
  plugins: [react()],
  build: {
    // Keep the demo bundle out of dist/ so npm publish ships only the library.
    outDir: 'demo-dist',
  },
});
