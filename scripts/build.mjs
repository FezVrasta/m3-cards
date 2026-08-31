// Production-Build: minifiziertes ESM-Bundle + kurzer Content-Hash für Cache-Busting.
import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ENTRY = 'src/index.ts'; // ggf. an den Einstiegspunkt des Forks anpassen
const OUTFILE = 'dist/m3x-cards.js';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2021',
  outfile: OUTFILE,
  banner: { js: `/* ${pkg.name} v${pkg.version} — https://github.com/DEIN_USER/${pkg.name} */` },
  logLevel: 'warning',
});

const hash = createHash('sha256').update(readFileSync(OUTFILE)).digest('hex').slice(0, 8);
writeFileSync('dist/.build-hash', hash);
console.log(`build ok: ${OUTFILE}  v${pkg.version}  (${hash})`);
