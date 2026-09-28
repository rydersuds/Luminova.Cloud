import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { chunkSizeWarningLimitKb } from './bundle-size.config.mjs';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const vendorChunkGroups = [
  {
    name: 'vendor-clerk',
    matches: ['/@clerk/'],
  },
  {
    name: 'vendor-react',
    matches: ['/react/', '/react-dom/', '/scheduler/'],
  },
  {
    name: 'vendor-query',
    matches: ['/@tanstack/'],
  },
  {
    name: 'vendor-ui',
    matches: [
      '/@radix-ui/',
      '/lucide-react/',
      '/cmdk/',
      '/next-themes/',
      '/sonner/',
    ],
  },
  {
    name: 'vendor-forms',
    matches: ['/react-hook-form/', '/@hookform/', '/zod/'],
  },
  {
    name: 'vendor-data',
    matches: [
      '/recharts/',
      '/date-fns/',
      '/react-day-picker/',
      '/embla-carousel-react/',
      '/vaul/',
    ],
  },
];

function manualChunks(id: string) {
  if (!id.includes('node_modules')) return undefined;

  const normalizedId = id.replaceAll(path.sep, '/');
  const group = vendorChunkGroups.find(({ matches }) =>
    matches.some((match) => normalizedId.includes(match)),
  );

  return group?.name ?? 'vendor-react';
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    chunkSizeWarningLimit: chunkSizeWarningLimitKb,
    rollupOptions: {
      output: {
        manualChunks,
        onlyExplicitManualChunks: true,
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
