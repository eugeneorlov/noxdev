import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/api/server.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist/api',
  // Disable tsup's node-protocol-plugin which strips the "node:" prefix from
  // built-in imports. This breaks node:sqlite which has no unprefixed alias.
  removeNodeProtocol: false
});