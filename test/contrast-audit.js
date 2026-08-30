// Contrast audit for a live dashboard.
//
// Walks every m3-* card on the page, finds each element that draws text or an
// icon, works out the colour actually behind it, and reports everything below
// its WCAG target. Run it once per theme.
//
// This exists as a file rather than as something typed into the console
// because the ad-hoc version got the answer wrong twice in one sitting, and
// both times the wrong answer was believable:
//
//   1. It read the background starting at the element's *parent*, so anything
//      carrying both a tint and its own label — a chip, a badge, an expand
//      toggle — was measured against the wrong surface. That under-reported by
//      more than half: 25 findings looked like 0.
//   2. It parsed rgb() and #hex but not the color(srgb ...) form Chromium
//      returns once a color-mix() has resolved, so tinted fills were skipped
//      in silence rather than counted.
//
// Both bugs made the page look better than it was, which is the direction a
// measurement must never fail in.
//
// Usage: paste into the browser console on a dashboard, then
//
//   m3ContrastAudit()                  -> array of findings
//   m3ContrastAudit({ gruppiert: true }) -> counts per card
//
// A finding means "this needs looking at", not "this is a bug": white on a
// coloured avatar and a deliberately muted disabled button both show up, and
// both are fine. Compare the two themes — a site that reports in only one of
// them is a theme fault; one that reports in both is a design decision.

(function () {
  const ZIEL_TEXT_KLEIN = 4.5; // WCAG AA, body text
  const ZIEL_TEXT_GROSS = 3; // >= 18.66px, or >= 14px bold
  const ZIEL_GRAFIK = 3; // WCAG non-text contrast, used for icons

  /** Parses every colour notation getComputedStyle actually returns here. */
  function parseCss(css) {
    const s = String(css).trim();
    let m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
    }
    // Chromium hands back color(srgb r g b / a) for a resolved color-mix().
    m = s.match(/^color\(\s*srgb\s+([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] === undefined ? 1 : p[3]];
    }
    m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat([1]);
    }
    return undefined;
  }

  function luminanz([r, g, b]) {
    const f = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  function kontrast(a, b) {
    const x = luminanz(a);
    const y = luminanz(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  const ueber = (c, grund) =>
    [0, 1, 2].map((i) => Math.round(c[i] * c[3] + grund[i] * (1 - c[3])));

  const hex = (c) =>
    "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  function karten(wurzel, tiefe, sammler) {
    wurzel = wurzel || document;
    tiefe = tiefe || 0;
    sammler = sammler || [];
    if (tiefe > 30) return sammler;
    for (const el of wurzel.querySelectorAll("*")) {
      const t = el.tagName.toLowerCase();
      if (t.startsWith("m3-") && !t.includes("editor")) sammler.push(el);
      if (el.shadowRoot) karten(el.shadowRoot, tiefe + 1, sammler);
    }
    return sammler;
  }

  /**
   * The colour actually behind `el`, composited.
   *
   * Starts at the element itself, not its parent: an element that paints its
   * own tint and then draws a label on it is the common case here, and
   * skipping that first background is what produced the false all-clear.
   */
  function grundVon(el, kartenGrund) {
    const stapel = [];
    let n = el;
    while (n) {
      const bg = parseCss(getComputedStyle(n).backgroundColor);
      if (bg && bg[3] > 0.02) stapel.push(bg);
      if (bg && bg[3] >= 0.999) break;
      n = n.parentElement || (n.getRootNode() && n.getRootNode().host);
    }
    let g = kartenGrund;
    for (let i = stapel.length - 1; i >= 0; i--) g = ueber(stapel[i], g);
    return g;
  }

  function zielFuer(el, stil) {
    if (el.tagName.toLowerCase() === "ha-icon") return ZIEL_GRAFIK;
    const px = parseFloat(stil.fontSize);
    const fett = Number(stil.fontWeight) >= 700;
    return px >= 18.66 || (px >= 14 && fett) ? ZIEL_TEXT_GROSS : ZIEL_TEXT_KLEIN;
  }

  window.m3ContrastAudit = function (optionen) {
    const opts = optionen || {};
    const treffer = [];

    for (const karte of karten()) {
      const cs = getComputedStyle(karte);
      const kartenGrund = parseCss(
        cs.getPropertyValue("--ha-card-background").trim() ||
          cs.getPropertyValue("--card-background-color").trim(),
      );
      // No resolvable card surface means no baseline to composite against;
      // reporting against a guess would be worse than skipping.
      if (!kartenGrund) continue;
      const name = karte.tagName.toLowerCase().replace(/^m3-|-card$/g, "");

      (function gehe(wurzel, tiefe) {
        if (tiefe > 14) return;
        for (const el of wurzel.querySelectorAll("*")) {
          const stil = getComputedStyle(el);
          const kasten = el.getBoundingClientRect();
          const hatText = Array.from(el.childNodes).some(
            (n) => n.nodeType === 3 && n.textContent.trim(),
          );
          const istIcon = el.tagName.toLowerCase() === "ha-icon";
          const sichtbar =
            kasten.width > 3 &&
            kasten.height > 3 &&
            stil.visibility !== "hidden" &&
            stil.opacity !== "0";

          if ((hatText || istIcon) && sichtbar) {
            const vg = parseCss(stil.color);
            if (vg && vg[3] > 0.05) {
              const grund = grundVon(el, kartenGrund.slice(0, 3));
              const sichtFarbe = ueber(vg, grund);
              const wert = kontrast(sichtFarbe, grund);
              const ziel = zielFuer(el, stil);
              if (wert < ziel - 0.01) {
                treffer.push({
                  karte: name,
                  klasse: String(
                    (el.className && el.className.baseVal) || el.className || "",
                  ).trim(),
                  text: (el.textContent || "").trim().slice(0, 24),
                  farbe: hex(sichtFarbe),
                  grund: hex(grund),
                  kontrast: Number(wert.toFixed(2)),
                  ziel,
                });
              }
            }
          }
          if (el.shadowRoot) gehe(el.shadowRoot, tiefe + 1);
        }
      })(karte.shadowRoot, 0);
    }

    treffer.sort((a, b) => a.kontrast - b.kontrast);

    if (opts.gruppiert) {
      const proKarte = {};
      for (const t of treffer) proKarte[t.karte] = (proKarte[t.karte] || 0) + 1;
      return { gesamt: treffer.length, proKarte };
    }
    return treffer;
  };

  console.log(
    "m3ContrastAudit() bereit — einmal je Theme ausführen und die Ergebnisse vergleichen.",
  );
})();
