import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    // Ensure support for modern ES features like Top-level await required by dependencies
    build: {
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('pdfjs-dist')) return 'vendor-pdf';
            if (id.includes('pptxgenjs')) return 'vendor-pptx';
          }
        }
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext'
      }
    }
  }
})