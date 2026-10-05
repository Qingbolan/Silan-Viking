import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  clearScreen: false,
  server: {
    port: 5184,
    strictPort: true,
  },
});
