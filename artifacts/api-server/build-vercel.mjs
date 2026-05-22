import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(artifactDir, "../..");

async function buildVercel() {
  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/serverless.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(rootDir, "api/_server.js"),
    logLevel: "info",
    external: [
      "*.node",
      "sharp",
      "pg-native",
    ],
    sourcemap: false,
    define: {
      "import.meta.url": "undefined",
    },
    banner: {
      js: `const { createRequire: __cr } = require('node:module');
const __path = require('node:path');
globalThis.require = __cr(__filename);
globalThis.__filename = __filename;
globalThis.__dirname = __path.dirname(__filename);
`,
    },
  });
}

buildVercel().catch((err) => {
  console.error(err);
  process.exit(1);
});
