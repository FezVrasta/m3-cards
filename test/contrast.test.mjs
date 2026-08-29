// Unit test for src/shared/contrast.ts.
//
// docs/TESTING.md explains why this project has no automated UI tests: Lit
// components with hass and WebSocket dependencies cannot be tested at a
// sensible cost. contrast.ts is the exception that reasoning allows — pure
// functions, no DOM, no hass — and it earned the test immediately by failing
// it: bisecting on floats and rounding afterwards left five of the thirteen
// palette colours a hundredth below their target.
//
//   npm run test:contrast
//
const m = await import("file://" + process.argv[2]);
const { parseColor, readableOnCss, contrastRatio, relativeLuminance, toHex, readableOn } = m;

const HELL = "#fafafa", DUNKEL = "#1c1c1c";
const PAL = { off:"#888780", heat:"#e57368", cool:"#6ba7dc", dryAuto:"#5dcaa5", fan:"#b8c4c9",
  solar:"#f0a24a", grid:"#8f79e0", home:"#85b7eb", ok:"#81c784", light:"#f0c46e",
  media:"#a58fe8", cover:"#9fd6bf", lightCard:"#ffc773" };

let fehler = 0;
const pruefe = (name, bed) => { if (!bed) { console.log("  FEHLER:", name); fehler++; } };

// Parser
pruefe("#abc", String(parseColor("#abc")) === "170,187,204");
pruefe("#a58fe8", String(parseColor("#a58fe8")) === "165,143,232");
pruefe("rgb()", String(parseColor("rgb(165, 143, 232)")) === "165,143,232");
pruefe("color(srgb)", String(parseColor("color(srgb 0.647059 0.560784 0.909804)")) === "165,143,232");
pruefe("var() -> undefined", parseColor("var(--x)") === undefined);
pruefe("unparsbar bleibt unverändert", readableOnCss("var(--x)", HELL) === "var(--x)");

console.log("\n  Farbe        Original   auf hell   angepasst  neu    | dunkel unverändert?");
console.log("  " + "-".repeat(74));
for (const [n, hex] of Object.entries(PAL)) {
  const vorher = contrastRatio(parseColor(hex), parseColor(HELL));
  const neu = readableOnCss(hex, HELL, 4.5);
  const nachher = contrastRatio(parseColor(neu), parseColor(HELL));
  const dunkelUnveraendert = readableOnCss(hex, DUNKEL, 4.5) === hex;
  pruefe(n + " erreicht 4.5:1", nachher >= 4.49);
  pruefe(n + " im Dunklen unangetastet", dunkelUnveraendert);
  console.log(`  ${n.padEnd(12)} ${hex}    ${vorher.toFixed(2).padStart(5)}:1   ${neu}  ${nachher.toFixed(2).padStart(5)}:1 | ${dunkelUnveraendert ? "ja" : "NEIN"}`);
}
// Randfälle
pruefe("bereits kontrastreich bleibt gleich", readableOnCss("#000000", HELL) === "#000000");
// Weiß auf Weiß: gerade so weit abdunkeln wie nötig, nicht bis Schwarz
{
  const r = readableOnCss("#ffffff", "#ffffff", 4.5);
  pruefe("Weiß auf Weiß erreicht 4.5:1", contrastRatio(parseColor(r), parseColor("#ffffff")) >= 4.49);
  pruefe("Weiß auf Weiß nicht bis Schwarz", r !== "#000000");
}
// #808080 hat Luminanz 0.22, gilt also als dunkle Fläche -> Richtung Weiß
pruefe("unerreichbares Ziel gibt Extrem", readableOnCss("#808080", "#808080", 21) === "#ffffff");
console.log("\n  " + (fehler ? `${fehler} FEHLER` : "alle Prüfungen bestanden"));
process.exit(fehler ? 1 : 0);
