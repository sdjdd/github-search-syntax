import { defineConfig } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default defineConfig([
  {
    input: 'dist/index.js',
    output: {
      file: 'dist/node.js',
      format: 'cjs',
    },
    external: ['chevrotain'],
  },
  {
    input: 'dist/index.js',
    output: {
      file: 'dist/browser.js',
      format: 'iife',
      name: 'GSS',
    },
    plugins: [commonjs(), nodeResolve(), terser()],
  },
]);
