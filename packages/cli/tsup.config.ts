import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cost/parser.ts", "src/cost/pricing.ts", "src/db/connection.ts"],
  format: ["esm"],
  target: "node24",
  platform: "node",
  bundle: true,
  splitting: false,
  clean: true,
  // Disable tsup's node-protocol-plugin which strips the "node:" prefix from
  // built-in imports.  This breaks node:sqlite which has no unprefixed alias.
  removeNodeProtocol: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
