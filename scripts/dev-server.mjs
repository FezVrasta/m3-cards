// Dev-Modus: Vite-Watch baut bei jedem Speichern neu,
// ein minimaler HTTP-Server liefert das Bundle mit CORS + No-Cache aus.
// HA-Resource (einmalig anlegen, Typ "JavaScript-Modul"):
//   http://<IP-dieses-Rechners>:5173/m3-cards-dev.js
import { build } from "vite";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";

const PORT = 5173;
const ENTRY = "src/index.ts"; // ggf. an den Einstiegspunkt des Forks anpassen
const OUTFILE = "m3-cards-dev.js";

await build({
  logLevel: "info",
  build: {
    lib: {
      entry: ENTRY,
      formats: ["es"],
      fileName: () => OUTFILE,
    },
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    sourcemap: "inline",
    watch: {},
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

http
  .createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const file = "dist" + (path === "/" ? `/${OUTFILE}` : path);
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
      res.end("not found");
    }
  })
  .listen(PORT, "0.0.0.0", () => {
    const ips = Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && i.family === "IPv4" && !i.internal)
      .map((i) => i.address);
    console.log("Dev-Server läuft. HA-Resource-URL(s):");
    for (const ip of ips) console.log(`  http://${ip}:${PORT}/${OUTFILE}`);
  });
