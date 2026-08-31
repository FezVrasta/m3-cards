// Dev-Modus: esbuild-Watch baut bei jedem Speichern in ~ms neu,
// ein minimaler HTTP-Server liefert das Bundle mit CORS + No-Cache aus.
// HA-Resource (einmalig anlegen, Typ "JavaScript-Modul"):
//   http://<IP-dieses-Rechners>:5173/m3x-cards-dev.js
import esbuild from 'esbuild';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';

const PORT = 5173;
const ENTRY = 'src/index.ts'; // ggf. an den Einstiegspunkt des Forks anpassen
const OUTFILE = 'dist/m3x-cards-dev.js';

const ctx = await esbuild.context({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  target: 'es2021',
  outfile: OUTFILE,
  sourcemap: 'inline',
  logLevel: 'info',
});
await ctx.watch();

http
  .createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const file = 'dist' + (path === '/' ? '/m3x-cards-dev.js' : path);
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
      res.end('not found');
    }
  })
  .listen(PORT, '0.0.0.0', () => {
    const ips = Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i.address);
    console.log('Dev-Server läuft. HA-Resource-URL(s):');
    for (const ip of ips) console.log(`  http://${ip}:${PORT}/m3x-cards-dev.js`);
  });
