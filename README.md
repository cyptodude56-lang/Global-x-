# Global Wallet — client demo

A static, no-build prototype of the multi-currency wallet concept: 3 demo
accounts (USA / UK / Germany), each with balances in USD, GBP and EUR, a
mock virtual card, and simulated Add money / Send / Exchange / Withdraw
flows. Everything lives in memory in the browser — there is no backend,
no database, and no real money, card, or bank connection anywhere in it.
Refreshing the page resets all data back to the seed values.

This is intentionally a small slice of the full roadmap (just enough for
a client to click through the idea) — not the Supabase/ledger/provider
architecture described in the full developer roadmap.

## Files

- `index.html` — page structure
- `styles.css` — all styling
- `app.js` — demo data + all the interactive logic

No npm install, no build step — just static files.

## Deploy to GitHub Pages

1. Create a new GitHub repository (or use an existing one) and add these
   three files to the root of the repo (or to a `/docs` folder — see step 3).
2. Commit and push:
   ```
   git add index.html styles.css app.js README.md
   git commit -m "Add Global Wallet demo"
   git push
   ```
3. On GitHub, go to **Settings → Pages**. Under "Build and deployment",
   set **Source** to "Deploy from a branch", pick the `main` branch, and
   choose either `/ (root)` or `/docs` depending on where you put the files.
4. Save. GitHub will give you a URL like
   `https://<your-username>.github.io/<repo-name>/` — usually live within
   a minute or two.

## Trying it locally first

Just open `index.html` directly in a browser, or run a tiny local server
from this folder, e.g. `python3 -m http.server 8000` and visit
`http://localhost:8000`.
