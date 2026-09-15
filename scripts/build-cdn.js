import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const OUT_DIR = process.env.OUT_DIR || 'dist/cdn';

// We use a custom Rollup plugin to rewrite core imports to reference the global Tensa object.
// This completely bypasses Rollup's IIFE globals interop which can get messy with default vs named exports.
function rewriteCoreImportsPlugin() {
  return {
    name: 'rewrite-core-imports',
    transform(code, id) {
      if (!id.includes('src/plugins')) return null;

      let newCode = code;
      // Rewrite core imports
      // import { resolveTargets } from '../../core/TargetResolver.js'; -> const { resolveTargets } = window.Tensa.default.__internal;

      newCode = newCode.replace(
        /import\s+\{([^}]+)\}\s+from\s+['"](?:\.\.\/)+core\/TargetResolver\.js['"];?/g,
        'const { $1 } = window.Tensa.default.__internal;'
      );

      newCode = newCode.replace(
        /import\s+\{([^}]+)\}\s+from\s+['"](?:\.\.\/)+core\/CSSPlugin\.js['"];?/g,
        'const { $1 } = window.Tensa.default.__internal;'
      );

      // import ticker from '../../core/Ticker.js'; -> const ticker = window.Tensa.loop;
      newCode = newCode.replace(
        /import\s+(\w+)\s+from\s+['"](?:\.\.\/)+core\/Ticker\.js['"];?/g,
        'const $1 = window.Tensa.loop;'
      );

      return { code: newCode, map: null };
    }
  };
}

async function buildCDN() {
  console.log('Building Core (tensajs.js)...');
  await build({
    configFile: false,
    build: {
      outDir: path.resolve(rootDir, OUT_DIR),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(rootDir, 'src/index.js'),
        name: 'Tensa',
        formats: ['iife'],
        fileName: () => 'tensajs.js'
      },
      minify: 'esbuild'
    }
  });

  const plugins = ['Dynamics', 'Interactable', 'LayoutMorph', 'PathMorph', 'PathTransition', 'ScrollSync', 'Text'];

  console.log('Building Plugins...');
  for (const plugin of plugins) {
    await build({
      configFile: false,
      plugins: [rewriteCoreImportsPlugin()],
      build: {
        outDir: path.resolve(rootDir, `${OUT_DIR}/plugins`),
        emptyOutDir: false,
        lib: {
          entry: path.resolve(rootDir, `src/plugins/${plugin}.js`),
          name: plugin === 'Dynamics' ? 'Tensa.Dynamics' : `Tensa.${plugin}`,
          formats: ['iife'],
          fileName: () => `${plugin.toLowerCase()}.js`
        },
        rollupOptions: {
          output: { extend: true }
        },
        minify: 'esbuild'
      }
    });
  }

  console.log('Building Sub-plugins (Physics)...');
  const physicsFiles = fs.readdirSync(path.resolve(rootDir, 'src/plugins/physics'))
                         .filter(f => f.endsWith('.js') && f !== 'utils.js');

  for (const file of physicsFiles) {
    const name = file.replace('.js', '');
    await build({
      configFile: false,
      plugins: [rewriteCoreImportsPlugin()],
      build: {
        outDir: path.resolve(rootDir, `${OUT_DIR}/plugins/dynamics`),
        emptyOutDir: false,
        lib: {
          entry: path.resolve(rootDir, `src/plugins/physics/${file}`),
          name: 'Tensa.Dynamics',
          formats: ['iife'],
          fileName: () => `${name.toLowerCase()}.js`
        },
        rollupOptions: {
          output: { extend: true }
        },
        minify: 'esbuild'
      }
    });
  }

  console.log('CDN build complete!');
}

buildCDN().catch(console.error);
