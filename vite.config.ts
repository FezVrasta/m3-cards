import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "m3-cards.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      output: {
        // bundle everything (incl. lit) into one file, no externals
        inlineDynamicImports: true,
        banner: `/* ${pkg.name} v${pkg.version} — https://github.com/UHaFnir/${pkg.name} */`,
      },
    },
  },
  plugins: [
    {
      name: "build-hash",
      closeBundle() {
        const hash = createHash("sha256")
          .update(readFileSync("dist/m3-cards.js"))
          .digest("hex")
          .slice(0, 8);
        writeFileSync("dist/.build-hash", hash);
        console.log(`build ok: dist/m3-cards.js  v${pkg.version}  (${hash})`);
      },
    },
  ],
});
