import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // Do NOT inline server secrets into the client bundle.
      define: {},
      server: {
        host: process.env.HOST ?? '127.0.0.1',
        port: (() => {
          const envPort = Number(process.env.PORT);
          return Number.isFinite(envPort) && envPort > 0 ? envPort : 5173;
        })(),
        strictPort: true,
        proxy: {
          '/api': {
            target: 'http://localhost:3009',
            changeOrigin: true,
            secure: false,
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
