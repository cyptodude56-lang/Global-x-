// ---------------------------------------------------------------------------
// add-motion.js — adds the motion layer to your pages.
//
// Run from the folder that holds your .html files:
//     node add-motion.cjs
//
// For each page it inserts these two lines right after the styles.css link:
//     <link rel="stylesheet" href="motion.css" />
//     <script src="motion.js"></script>
//
// Safe to run more than once (pages that already have them are skipped),
// keeps each file's own line endings, and never touches anything else in the
// page. kyc.html is left out on purpose: it has its own animation.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

const PAGES = [
  "index", "confirm-email", "complete-profile",
  "dashboard", "accounts", "cards", "payments", "transfers", "statements", "settings",
];

const dir = process.cwd();
const missingAssets = ["motion.css", "motion.js"].filter((f) => !fs.existsSync(path.join(dir, f)));
if (missingAssets.length) {
  console.error(`Can't find ${missingAssets.join(" and ")} in ${dir}.`);
  console.error("Run this from the folder that contains motion.css, motion.js and your pages.");
  process.exit(1);
}

const STYLES_LINK = /<link\b[^>]*href=["']styles\.css["'][^>]*>/i;
let changed = 0;

for (const name of PAGES) {
  const file = path.join(dir, name + ".html");
  if (!fs.existsSync(file)) {
    console.log(`  skipped   ${name}.html (not found)`);
    continue;
  }
  const html = fs.readFileSync(file, "utf8");
  if (/motion\.css|motion\.js/.test(html)) {
    console.log(`  already   ${name}.html`);
    continue;
  }
  const m = STYLES_LINK.exec(html);
  if (!m) {
    console.log(`  NO CHANGE ${name}.html (couldn't find the styles.css link; add the two lines by hand)`);
    continue;
  }
  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  const insert = m[0] + eol + '<link rel="stylesheet" href="motion.css" />' + eol + '<script src="motion.js"></script>';
  fs.writeFileSync(file, html.slice(0, m.index) + insert + html.slice(m.index + m[0].length));
  console.log(`  updated   ${name}.html`);
  changed++;
}

console.log(changed ? `\nDone: ${changed} page(s) updated. Hard-refresh the browser (Ctrl+Shift+R).` : "\nNothing to change.");
