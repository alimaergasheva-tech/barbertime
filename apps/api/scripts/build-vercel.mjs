/**
 * Builds the API as one Vercel Node.js function (Build Output API v3):
 *   1. esbuild bundles src/vercel.ts with workspace TS sources and the Prisma client;
 *   2. @vercel/nft copies runtime files esbuild can't inline (the native argon2 binary);
 *   3. every path is routed to that function.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeFileTrace } from "@vercel/nft";
import { build } from "esbuild";

const apiDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(apiDir, "../..");
const output = path.join(apiDir, ".vercel/output");
const funcDir = path.join(output, "functions/index.func");
const bundle = path.join(apiDir, "dist/vercel/index.mjs");

await rm(output, { recursive: true, force: true });
await rm(path.dirname(bundle), { recursive: true, force: true });

await build({
  entryPoints: [path.join(apiDir, "src/vercel.ts")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Native addon and optional pg driver stay external.
  external: ["@node-rs/argon2", "pg-native"],
  // CommonJS dependencies (fastify, pg) call require/__dirname inside the ESM bundle.
  banner: {
    js: [
      'import { createRequire as __createRequire } from "node:module";',
      'import { fileURLToPath as __fileURLToPath } from "node:url";',
      'import { dirname as __pathDirname } from "node:path";',
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __pathDirname(__filename);",
    ].join("\n"),
  },
  logLevel: "warning",
});

const { fileList } = await nodeFileTrace([bundle], { base: repoRoot });
for (const file of fileList) {
  const target = path.join(funcDir, file);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(repoRoot, file), target, { dereference: true, recursive: true });
}

await writeFile(
  path.join(funcDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: path.relative(repoRoot, bundle),
      launcherType: "Nodejs",
      // Fastify reads the raw body itself.
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 30,
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(output, "config.json"),
  JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }, null, 2),
);

console.log(`Vercel function: ${fileList.size} files → ${path.relative(apiDir, funcDir)}`);
