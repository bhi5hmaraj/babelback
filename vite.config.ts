import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
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
