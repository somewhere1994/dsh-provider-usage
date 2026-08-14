import { defineConfig } from 'tsdown'

const id = 'dsh-provider-usage'

export default defineConfig([
  {
    name: id,
    entry: { index: 'src/index.js' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    clean: true,
    dts: false,
  },
  {
    name: `${id}/client`,
    entry: { client: 'src/client.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    clean: false,
    dts: false,
    sourcemap: true,
    deps: {
      neverBundle: ['react'],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
