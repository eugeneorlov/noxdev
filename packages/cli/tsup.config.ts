import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cost/parser.ts", "src/cost/pricing.ts", "src/db/connection.ts"],
  format: ["esm"],
  target: "node18",
  bundle: true,
  splitting: false,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
