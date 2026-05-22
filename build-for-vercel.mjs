import { execSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const FUNC_DIR = ".vercel/output/functions/api/handler.func";
const STATIC_DIR = ".vercel/output/static";

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function assertExists(p, label) {
  if (!existsSync(p)) {
    console.error(`FATAL: ${label} not found at ${p}`);
    process.exit(1);
  }
}

try {
  if (existsSync(".vercel/output")) {
    rmSync(".vercel/output", { recursive: true, force: true });
  }

  console.log("=== Step 1/3: Building frontend ===");
  run("pnpm --filter @workspace/poultry-manager run build", {
    env: { ...process.env, NODE_ENV: "production" },
  });
  assertExists("artifacts/poultry-manager/dist/public/index.html", "Frontend build output");

  console.log("=== Step 2/3: Building API bundle ===");
  run("pnpm --filter @workspace/api-server run build:vercel");
  assertExists("api/_server.js", "API bundle");

  console.log("=== Step 3/3: Creating Vercel Build Output ===");

  mkdirSync(STATIC_DIR, { recursive: true });
  cpSync("artifacts/poultry-manager/dist/public", STATIC_DIR, { recursive: true });

  mkdirSync(FUNC_DIR, { recursive: true });
  cpSync("api/handler.js", path.join(FUNC_DIR, "handler.js"));
  cpSync("api/_server.js", path.join(FUNC_DIR, "_server.js"));

  writeFileSync(
    path.join(FUNC_DIR, ".vc-config.json"),
    JSON.stringify({
      runtime: "nodejs22.x",
      handler: "handler.js",
      launcherType: "Nodejs",
      maxDuration: 30,
    })
  );

  writeFileSync(
    ".vercel/output/config.json",
    JSON.stringify(
      {
        version: 3,
        routes: [
          { src: "/api/.*", dest: "/api/handler" },
          { handle: "filesystem" },
          { src: "/(.*)", dest: "/index.html" },
        ],
      },
      null,
      2
    )
  );

  assertExists(path.join(FUNC_DIR, "handler.js"), "Function handler");
  assertExists(path.join(STATIC_DIR, "index.html"), "Static index.html");

  console.log("=== Build complete ===");
} catch (err) {
  console.error("Build failed:", err.message);
  process.exit(1);
}
