// Assembles README.md from docs/README.template.md + docs/cards/*.md.
// Pure mechanical merge, no LLM involved — run after editing any card doc.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const CATEGORY_HEADINGS = {
  energy: '🔌 Energy & power',
  climate: '🌡️ Climate & weather',
  light: '💡 Light, media & control',
  presence: '🚪 Presence & safety',
  household: '🧺 Household & planning',
  system: '🛠️ System & maintenance',
  special: '🐠 Special',
  layout: '🧱 Layout',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_HEADINGS);

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]+?)\n---\n\n?([\s\S]*)$/);
  if (!m) throw new Error('missing frontmatter');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    fm[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return { fm, body: m[2] };
}

// --- canonical card order, from src/index.ts export order ---
const indexSrc = readFileSync('src/index.ts', 'utf8');
const order = [...indexSrc.matchAll(/export \* from "\.\/(m3-[a-z0-9-]+)"/g)].map((m) => m[1]);

// --- load every card doc ---
const files = readdirSync('docs/cards').filter((f) => f.endsWith('.md'));
const cards = files.map((f) => {
  const { fm, body } = parseFrontmatter(readFileSync(`docs/cards/${f}`, 'utf8'));
  return { ...fm, body };
});

const byType = new Map(cards.map((c) => [c.type, c]));
const orderedCards = order.map((type) => {
  const card = byType.get(type);
  if (card) return card;
  // combined cards (e.g. m3-system-card living inside nas-card.md) have no
  // own file — find the card whose also_type matches instead.
  return cards.find((c) => c.also_type === type);
});
if (orderedCards.some((c) => !c)) {
  const missing = order.filter((type, i) => !orderedCards[i]);
  throw new Error(`no docs/cards/*.md entry for: ${missing.join(', ')}`);
}

const cardCount = order.length;

// --- category tables (row order follows each card's own `table_order`,
// captured from the original hand-curated tables — this is independent of
// the src/index.ts export order used for the card sections below) ---
function anchor(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s/-]/g, '').trim().replace(/\s*\/\s*/g, '--').replace(/\s+/g, '-');
}

const categoryTables = CATEGORY_ORDER.map((key) => ({ key, heading: CATEGORY_HEADINGS[key], entries: [] }));
const tableByKey = new Map(categoryTables.map((t) => [t.key, t]));
for (const card of cards) {
  tableByKey.get(card.category).entries.push({
    order: Number(card.table_order),
    row: `| [${card.display}](#${anchor(card.title)}) | \`${card.type}\` | ${card.summary} |`,
  });
  if (card.also_type) {
    tableByKey.get(card.category).entries.push({
      order: Number(card.also_table_order),
      row: `| [${card.also_display}](#${anchor(card.title)}) | \`${card.also_type}\` | ${card.also_summary} |`,
    });
  }
}
for (const table of categoryTables) {
  table.entries.sort((a, b) => a.order - b.order);
  table.rows = table.entries.map((e) => e.row);
}

const categoryTablesMd = categoryTables
  .filter((t) => t.rows.length > 0)
  .map((t) => `### ${t.heading}\n\n| Card | Type | What it does |\n| --- | --- | --- |\n${t.rows.join('\n')}`)
  .join('\n\n');

// --- card sections, in src/index.ts order, de-duplicating combined entries ---
const seenSlugs = new Set();
const sectionsMd = orderedCards
  .filter((card) => {
    // combined card (e.g. NAS/System) appears twice in `order`, once per
    // type, but must render once
    if (seenSlugs.has(card.title)) return false;
    seenSlugs.add(card.title);
    return true;
  })
  .map((card) => `## ${card.title}\n\n${card.body}`)
  .join('\n')
  .trimEnd();

// --- assemble ---
let readme = readFileSync('docs/README.template.md', 'utf8');
// Note: replacement must be a function, not a string — a literal "$`"/"$&"/
// "$'" inside a card doc's body (e.g. a regex example ending in `$`, right
// before a closing backtick) is otherwise interpreted by String.replace as
// a special substitution pattern instead of literal text.
readme = readme.replace('{{CARD_COUNT}}', () => String(cardCount));
readme = readme.replace('{{CATEGORY_TABLES}}', () => categoryTablesMd);
readme = readme.replace('{{CARD_SECTIONS}}', () => sectionsMd);

writeFileSync('README.md', readme);

// --- keep package.json's card count in sync ---
const pkgRaw = readFileSync('package.json', 'utf8');
const pkgPatched = pkgRaw.replace(/(\d+) cards across/, `${cardCount} cards across`);
if (pkgPatched !== pkgRaw) writeFileSync('package.json', pkgPatched);

console.log(`README.md generated (${cardCount} cards).`);
