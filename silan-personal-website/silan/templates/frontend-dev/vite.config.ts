import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  // Development must read the locally synced database by default; otherwise
  // a frontend restart silently displays silan.tech's older content. A proxy
  // target remains overridable for integration testing and production builds.
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET ||
    (mode === 'development' ? 'http://localhost:5200' : 'https://silan.tech');
  const developmentCountry = env.VITE_DEV_COUNTRY || 'SG';

  return {
    base: env.VITE_PUBLIC_BASE || '/',
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: !apiProxyTarget.startsWith('http://'),
          headers: mode === 'development'
            ? { 'CF-IPCountry': developmentCountry }
            : undefined,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: env.VITE_BUILD_SOURCEMAP === 'true',
    },
  };
})
