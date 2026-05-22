import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(artifactDir, "../..");

const sharpNoopPlugin = {
  name: "sharp-noop",
  setup(build) {
    build.onResolve({ filter: /^sharp$/ }, () => ({
      path: "sharp",
      namespace: "sharp-noop",
    }));
    build.onLoad({ filter: /.*/, namespace: "sharp-noop" }, () => ({
      contents: `
        function unavailable() {
          throw new Error("sharp is not available in serverless environment");
        }
        const handler = { get: (_, k) => k === "__esModule" ? false : unavailable };
        module.exports = new Proxy(unavailable, handler);
      `,
      loader: "js",
    }));
  },
};

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
      "pg-native",
    ],
    plugins: [sharpNoopPlugin],
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
