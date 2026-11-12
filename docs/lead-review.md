# Local lead sample review

This is an internal browser workflow for preparing and comparing restaurant site concepts. It does not publish sites or send outreach. The public showcase build still emits only `index.html`.

## Open the review page

From the project folder, with your own lead CSV:

```powershell
npm run prepare:leads -- "path/to/leads.csv"
npm run dev:review
```

Open the local URL printed by Vite, then add `/review.html`. The importer reads the supplied CSV. It merges curated research from `.local/pilot-research.json` when present, writes `.local/lead-review.json`, and leaves existing selections in `.local/selections.json`. These `.local` files are ignored by Git. The review server binds to loopback; its data API also rejects remote clients. Vite denies direct access to `.local` files. Without curated research, leads appear in a research-needed state rather than showing three concepts.

For a fictional one-restaurant example, use `npm run prepare:leads -- examples/demo-leads.csv examples/demo-research.json`. The optional second path supplies a research JSON file instead of `.local/pilot-research.json`. Preparing leads replaces `.local/lead-review.json` but preserves selections and email drafts; use a fresh clone or back up local review state before switching datasets. The example files show the CSV columns and research structure required for a complete review.

The sidebar lists every lead. Leads with curated research have three website concept cards each. Each preview is styled as a restaurant homepage, with the restaurant name as its main headline and a short blurb about relevant HAI Solutions services: custom web design, direct ordering or POS integration, photography, and search visibility. A card's **Design aim** says what it tries to achieve. Its image source and reuse status appear below the preview.

Enter design notes and press **Regenerate 3 options** to replace the current three cards. The local remix uses six curated photographs and six alternate copy angles per pilot client. It can react to `menu`, `order`, `quick`, `simple`, `elegant`, `editorial`, `photo`, `bright`, `dark`, `green`, `blue`, `red`, `orange`, and `warm` cues. Other notes are preserved for a later human or agent design pass; this button does not call a language model or research the web. The current round and generated cards survive reloads.

Use **Flashcards** in the header to review each prepared restaurant in a focused view. The three homepage directions appear together with a short brief, a need statement, a reason for each design, and the licensed photo pool. Open a card to inspect it full screen. **Check this option** saves it to **Checkout** and advances to the next prepared restaurant; **Back to three options** returns without saving. **Exit** opens the checkout grid early. The remaining leads show their CSV evidence and a research-needed state.

In Checkout, **Create HTML email templates** makes one local template per selected restaurant and opens **Ready to send**. The header badge counts current templates. That page previews each email, lets you copy or download its HTML, and exports the current batch as a ZIP. Templates are stored in `.local/email-drafts.json`; changing a selected design or changing the template version makes its previous template stale until you create templates again. Each email uses a homepage-style header, a prominent restaurant name, a concept image, a short HAI service blurb, and service navigation. The photograph is embedded so the local HTML preview is self-contained; email client support for embedded data images varies, so host the image before real outreach. Recipient addresses and email sending are not connected yet.

## Resume and expand

## Gather restaurant image links

After `prepare:leads`, collect links for one restaurant:

```powershell
npm run gather:images -- --lead "Restaurant Name" --site "https://restaurant.example/"
```

The `--site` option is optional when the lead research already has a usable restaurant site URL. Use `--all` to scan every lead with an identified site. The crawler follows up to 30 same-host HTML pages and records up to 150 image links per lead by default; `--max-pages` and `--max-images` adjust those limits. It collects image URLs, alt text, and source pages in `.local/image-inventory.json`. It does not download the images. This is a bounded discovery pass, so it cannot guarantee every image on a JavaScript-only site or across the whole web.

For Google image results, set `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_CX` for an existing Google Programmable Search Engine with image search enabled. The pipeline records up to 30 image result links and their publisher pages. Without those credentials, it supplies a Google Images search link for each lead. Google Places photos are not copied or cached. Google image matches need manual identity and rights review.

The local review page shows the link inventory. It uses restaurant site candidates in concept previews, and a specific site or Google result can be chosen from the gallery. When **Create HTML email templates** runs, only the image attached to each chosen direction is downloaded, converted to WebP, and saved under `.local/selected-images/`. The HTML draft embeds that WebP. Confirm rights to reuse a restaurant or third-party image before sending the draft; WebP data images may not render in every email client, so preview in the target client before outreach.

The public showcase build does not include `.local` research, selected images, or the review page.

For each queued lead, check the current public site, menus, listings, identity, business and domain ownership, design cues, and uncertain facts. Record dated source URLs, concise findings, and a short `needs` statement in `.local/pilot-research.json`. Each prepared entry needs exactly three distinct `variants`, at least six appropriate `photoPool` asset IDs, and six `alternateCopy` angles. Use existing `content/showcase.json` scene IDs as design references. Run `npm run prepare:leads -- "path-to-current-CSV.csv"` again to refresh the queue; selections and email templates remain separate.

Do not copy photographs from restaurant pages or delivery listings merely because they are public. Use `content/asset-library.json` photos with file-level CC0 records and inspect subject suitability. Before adding a new asset, follow `docs/asset-library.md`: verify the individual Commons file's license, record the source and author, inspect recognizable people and marks, and make local desktop/mobile versions. A business-owned image requires explicit reuse rights and a corresponding license record. Confirm hours, menu items, prices, preferred order links, and brand claims with the owner before a client-facing sample.

The catalog keeps its original per-file verification dates; `scripts/sync-assets.ps1 -VerifyOnly` does not rewrite them.

The CSV `website` field often contains prose, not a URL. Treat it and the lead research document as dated research, not as a verified business fact. The pilot uses current source pages for cuisine/menu direction while marking ownership and details that still require confirmation.
