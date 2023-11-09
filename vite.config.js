import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    lib: {
      entry: {
        'tensajs': resolve(__dirname, 'src/index.js'),
        'plugins/Dynamics': resolve(__dirname, 'src/plugins/Dynamics.js'),
        'plugins/Interactable': resolve(__dirname, 'src/plugins/Interactable.js'),
        'plugins/LayoutMorph': resolve(__dirname, 'src/plugins/LayoutMorph.js'),
        'plugins/PathMorph': resolve(__dirname, 'src/plugins/PathMorph.js'),
        'plugins/PathTransition': resolve(__dirname, 'src/plugins/PathTransition.js'),
        'plugins/ScrollSync': resolve(__dirname, 'src/plugins/ScrollSync.js'),
        'plugins/Text': resolve(__dirname, 'src/plugins/Text.js'),
      },
      name: 'Tensa',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        if (format === 'es') return `${entryName}.esm.js`;
        if (format === 'cjs') return `${entryName}.cjs.js`;
        return `${entryName}.js`;
      },
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
    sourcemap: true,
    minify: 'esbuild',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
