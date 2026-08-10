import { defineConfig } from "vite";

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
      },
    },
  },
});
