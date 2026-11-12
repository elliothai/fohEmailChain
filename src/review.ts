import assetContent from '../content/asset-library.json';
import JSZip from 'jszip';
import './review.css';

type Variant = { id: string; label: string; layout: string; sourceSceneId: string; heroAssetId: string; colors: { ink: string; paper: string; accent: string }; eyebrow: string; headline: string; intro: string; menuTitle: string; menuItems: string[]; designSignature: string };
type Source = { label: string; url: string; finding: string };
type Research = { reviewedOn: string; vibe: string; needs?: string; paletteReason: string; uncertainFacts: string[]; sources: Source[]; variants: Variant[]; photoPool: string[]; alternateCopy: { headline: string; intro: string; menuTitle: string }[] };
type Lead = { id: string; name: string; category: string; address: string; cityArea: string; phone: string; leadDate: string; rank: string; existingWebsiteNote: string; otherLinks: string[]; problemEvidence: string; proposedFix: string; caveats: string; sourceLogReference: string; status: string; research: Research | null };
type ReviewData = { preparedOn: string; sourceCsv: string; leads: Lead[] };
type Decision = { selectedVariantId: string | null; note: string; updatedOn: string; round?: number; generatedVariants?: Variant[]; imageUrl?: string };
type Selections = Record<string, Decision>;
type Asset = { id: string; alt: string; author: string; sourceUrl: string; license: string; licenseUrl: string; verifiedOn: string; image: string; smallImage: string; sourceWidth: number; sourceHeight: number };
type RestaurantImage = { imageUrl: string; pageUrl: string; alt: string; rights: string; usableInOutreach: boolean };
type ImageInventory = { leads: Record<string, { website: string | null; sitePages: string[]; images: RestaurantImage[]; google: { searchUrl: string; results: { imageUrl: string; pageUrl: string; title: string }[]; status: string } | null; errors: string[] }> };
type EmailDraft = { leadId: string; variantId: string; imageUrl?: string; subject: string; html: string; createdOn: string; templateVersion?: number };
type EmailDrafts = Record<string, EmailDraft>;
type View = 'detail' | 'flashcard' | 'checkout' | 'ready';

const assetMap = new Map((assetContent.assets as Asset[]).map((asset) => [asset.id, asset]));
const app = document.querySelector<HTMLDivElement>('#app')!;
const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const safeUrl = (value: string): string => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const date = (value: string): string => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
let data: ReviewData;
let selections: Selections = {};
let emailDrafts: EmailDrafts = {};
let imageInventory: ImageInventory = { leads: {} };
let activeId = '';
let filter = '';
let view: View = 'detail';
let previewVariantId: string | null = null;

function currentVariants(lead: Lead): Variant[] { return selections[lead.id]?.generatedVariants || lead.research?.variants || []; }
function designIntent(layout: string): string {
  if (layout === 'counter') return 'Help guests reach food choices quickly, especially on a phone.';
  if (layout === 'editorial') return 'Give the restaurant a more personal, considered first impression.';
  return 'Create an appetite and a sense of occasion before the menu.';
}

function serviceBlurb(layout: string): string {
  if (layout === 'counter') return 'HAI Solutions can build a fast restaurant site with a clear menu and direct ordering or POS integration, helping guests order in fewer steps.';
  if (layout === 'editorial') return 'HAI Solutions pairs custom web design, photography, and search optimization to help guests discover your story and plan a visit.';
  return 'HAI Solutions can create a custom restaurant site that showcases your food and atmosphere, helps guests find you, and leads them toward direct ordering.';
}

function regenerate(lead: Lead, round: number, notes: string): Variant[] {
  const research = lead.research!;
  const lowered = notes.toLowerCase();
  const preferred = /menu|order|quick|simple|clear/.test(lowered) ? 'counter' : /elegant|editorial|refined|quiet/.test(lowered) ? 'editorial' : /photo|image|atmosphere|dramatic/.test(lowered) ? 'cinematic' : '';
  const layouts = ['cinematic', 'editorial', 'counter'];
  if (preferred) layouts.unshift(...layouts.splice(layouts.indexOf(preferred), 1));
  return layouts.map((layout, index) => {
    const base = research.variants.find((item) => item.layout === layout)!;
    const copy = research.alternateCopy[((round - 1) * 3 + index) % research.alternateCopy.length];
    const heroAssetId = research.photoPool[((round - 1) * 3 + index + 3) % research.photoPool.length];
    const accent = /green|jade/.test(lowered) ? '#397253' : /blue/.test(lowered) ? '#386d91' : /red|tomato/.test(lowered) ? '#b94736' : /orange|warm/.test(lowered) ? '#cf712e' : base.colors.accent;
    const paper = /bright|light|airy/.test(lowered) ? '#fff6e9' : /dark|moody|night/.test(lowered) ? '#d9cbb6' : base.colors.paper;
    return { ...base, id: `${base.id}-r${round}`, label: `${base.label} · ${round + 1}`, heroAssetId, headline: copy.headline, intro: copy.intro, menuTitle: copy.menuTitle, colors: { ...base.colors, paper, accent }, designSignature: 'New photograph and palette from the locally curated concept bank.' };
  });
}

function nextReadyLead(currentId: string): Lead | undefined {
  const ready = data.leads.filter((lead) => lead.research);
  const currentIndex = ready.findIndex((lead) => lead.id === currentId);
  return [...ready.slice(currentIndex + 1), ...ready.slice(0, currentIndex)].find((lead) => !selections[lead.id]?.selectedVariantId);
}

function chosen(lead: Lead): Variant | undefined { return currentVariants(lead).find((item) => item.id === selections[lead.id]?.selectedVariantId); }
function chosenLeads(): Lead[] { return data.leads.filter((lead) => chosen(lead)); }
function readyDrafts(): EmailDraft[] { return chosenLeads().map((lead) => emailDrafts[lead.id]).filter((draft): draft is EmailDraft => { if (!draft || draft.templateVersion !== 4) return false; const lead = data.leads.find((item) => item.id === draft.leadId); const variant = lead && chosen(lead); return Boolean(lead && variant && variant.id === draft.variantId && draft.imageUrl === previewPhoto(lead, variant).url); }); }
function short(value: string, limit = 170): string { const clean = value.replace(/\s+/g, ' ').trim(); return clean.length > limit ? `${clean.slice(0, limit).replace(/\s+\S*$/, '')}…` : clean; }
function needs(lead: Lead): string { return short(lead.research?.needs || lead.proposedFix || lead.existingWebsiteNote || lead.problemEvidence, 160) || 'A clearer restaurant website and menu path.'; }
function safeColor(value: string): string { return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#342c26'; }
function fileName(lead: Lead): string { return lead.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || lead.id; }
function restaurantPhotos(lead: Lead): RestaurantImage[] {
  return (imageInventory.leads[lead.id]?.images || []).filter((image) => !/logo|icon|avatar|sprite|placeholder|favicon|assets\/admin|\.svg(?:\?|$)/i.test(`${image.imageUrl} ${image.alt}`));
}
function previewPhoto(lead: Lead, variant: Variant): { url: string; alt: string; restaurant: boolean; pageUrl: string } {
  const photos = restaurantPhotos(lead);
  const preferred = selections[lead.id]?.imageUrl;
  const manual = preferred && [...photos, ...(imageInventory.leads[lead.id]?.google?.results || []).map((result) => ({ imageUrl: result.imageUrl, pageUrl: result.pageUrl, alt: result.title, rights: 'unverified', usableInOutreach: false }))].find((image) => image.imageUrl === preferred);
  if (manual) return { url: manual.imageUrl, alt: manual.alt || `${lead.name} image candidate`, restaurant: true, pageUrl: manual.pageUrl };
  const index = currentVariants(lead).findIndex((item) => item.id === variant.id);
  const image = photos[index];
  if (image) return { url: image.imageUrl, alt: image.alt || `${lead.name} restaurant image candidate`, restaurant: true, pageUrl: image.pageUrl };
  const asset = assetMap.get(variant.heroAssetId)!;
  return { url: asset.smallImage, alt: asset.alt, restaurant: false, pageUrl: asset.sourceUrl };
}

function homepage(lead: Lead, variant: Variant, fullImage = false): string {
  const photo = previewPhoto(lead, variant);
  const image = !photo.restaurant && fullImage ? assetMap.get(variant.heroAssetId)!.image : photo.url;
  return `<div class="home-page" data-layout="${escapeHtml(variant.layout)}" style="--ink:${safeColor(variant.colors.ink)};--paper:${safeColor(variant.colors.paper)};--accent:${safeColor(variant.colors.accent)}">
    <div class="home-page__mast"><span class="home-page__brand">${escapeHtml(lead.name)}</span><span class="home-page__links">Website &nbsp; Ordering &nbsp; Growth</span><span class="home-page__booking">Explore HAI ↗</span></div>
    <div class="home-page__hero"><img src="${escapeHtml(image)}" alt="${escapeHtml(photo.alt)}" loading="lazy"><div class="home-page__hero-copy"><span class="home-page__eyebrow">HAI SOLUTIONS · RESTAURANT WEB DESIGN</span><strong>${escapeHtml(lead.name)}</strong><p>${escapeHtml(serviceBlurb(variant.layout))}</p><span class="home-page__cta">See what HAI can build ↗</span></div></div>
    <div class="home-page__below"><div><span>HAI SERVICES</span><strong>Built around your restaurant</strong></div><p>Custom websites · Direct ordering · Search visibility</p><span class="home-page__arrow">↗</span></div>
  </div>`;
}

function sourceLink(source: Source): string {
  const href = safeUrl(source.url);
  return `<li><strong>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} ↗</a>` : escapeHtml(source.label)}</strong><p>${escapeHtml(source.finding)}</p></li>`;
}

function variantCard(lead: Lead, variant: Variant): string {
  const asset = assetMap.get(variant.heroAssetId)!;
  const photo = previewPhoto(lead, variant);
  const selected = selections[lead.id]?.selectedVariantId === variant.id;
  const palette = variant.colors;
  const style = `--ink:${palette.ink};--paper:${palette.paper};--accent:${palette.accent}`;
  return `<article class="variant" data-layout="${escapeHtml(variant.layout)}" style="${style}">
    <div class="variant__top"><div><span class="variant__number">0${currentVariants(lead).indexOf(variant) + 1}</span><h3>${escapeHtml(variant.label)}</h3></div><span class="variant__basis">Inspired by ${escapeHtml(variant.sourceSceneId.replaceAll('-', ' '))}</span></div>
    <div class="sample" aria-label="${escapeHtml(variant.label)} homepage concept">
      <section class="sample__landing">
        <div class="sample__photo"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt)}" loading="lazy" /></div>
        <div class="sample__nav"><strong>${escapeHtml(lead.name)}</strong><span>WEBSITE · ORDERING · GROWTH</span></div>
        <div class="sample__copy"><span class="sample__eyebrow">HAI SOLUTIONS</span><h4>${escapeHtml(lead.name)}</h4><p>${escapeHtml(serviceBlurb(variant.layout))}</p></div>
      </section>
    </div>
    <p class="variant__signature"><b>Design aim:</b> ${escapeHtml(designIntent(variant.layout))}<br />${escapeHtml(variant.designSignature)}</p>
    <div class="variant__photo">${photo.restaurant ? `<span>Restaurant site candidate · reuse rights unverified</span><a href="${escapeHtml(safeUrl(photo.pageUrl))}" target="_blank" rel="noopener noreferrer">Source page ↗</a>` : `<span>Illustrative photo · not this restaurant</span><a href="${escapeHtml(safeUrl(asset.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(asset.author)} ↗</a><a href="${escapeHtml(safeUrl(asset.licenseUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(asset.license)}</a><span>Verified ${escapeHtml(asset.verifiedOn)}</span>`}</div>
    <button class="select-button${selected ? ' is-selected' : ''}" type="button" data-select="${escapeHtml(variant.id)}" aria-pressed="${selected}">${selected ? 'Chosen · continue to next →' : 'Choose this · next restaurant →'}</button>
  </article>`;
}

function nav(): string {
  const visible = data.leads.filter((lead) => `${lead.name} ${lead.cityArea} ${lead.category}`.toLowerCase().includes(filter));
  return `<div class="lead-list__summary">${data.leads.filter((lead) => lead.research).length} samples ready · ${data.leads.length} leads total</div>${visible.map((lead) => {
    const selected = selections[lead.id]?.selectedVariantId;
    return `<button class="lead-item${lead.id === activeId ? ' is-active' : ''}" type="button" data-lead="${escapeHtml(lead.id)}" aria-current="${lead.id === activeId ? 'true' : 'false'}"><span class="lead-item__name">${escapeHtml(lead.name)}</span><span class="lead-item__meta">${escapeHtml(lead.cityArea)} · ${lead.research ? selected ? 'Direction selected' : '3 samples ready' : 'Research needed'}</span></button>`;
  }).join('') || '<p class="lead-list__empty">No matching leads.</p>'}`;
}

function detail(lead: Lead): string {
  const research = lead.research;
  const decision = selections[lead.id];
  const ready = data.leads.filter((item) => item.research);
  const position = ready.findIndex((item) => item.id === lead.id) + 1;
  return `<header class="client-header"><div><span class="section-label">${research ? `Restaurant ${position} of ${ready.length} · round ${(decision?.round || 0) + 1}` : 'Queue · research needed'}</span><h1>${escapeHtml(lead.name)}</h1><p>${escapeHtml([lead.category, lead.cityArea].filter(Boolean).join(' · '))}</p></div><div class="client-header__status">${decision?.selectedVariantId ? 'Direction selected' : 'Choose one direction'}</div></header>
  <div class="fact-strip"><span><b>Address</b>${escapeHtml([lead.address, lead.cityArea].filter(Boolean).join(', ')) || 'Unconfirmed'}</span><span><b>Phone in CSV</b>${escapeHtml(lead.phone) || 'Not supplied'}</span><span><b>Lead found</b>${escapeHtml(lead.leadDate) || 'Unknown'}</span></div>
  ${research ? `<section class="research"><div><span class="section-label">Current public presence · reviewed ${escapeHtml(research.reviewedOn)}</span><h2>${escapeHtml(research.vibe)}</h2><p>${escapeHtml(research.paletteReason)}</p></div><div class="research__sources"><h3>Evidence and open questions</h3><ul class="sources">${research.sources.map(sourceLink).join('')}</ul><ul class="uncertain">${research.uncertainFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul></div></section>
  <div class="variants-heading"><div><span class="section-label">Compare three website cards</span><h2>Homepage concepts</h2></div><p>Choose a card to save it and move to the next restaurant. Site copy and images are illustrative.</p></div>
  <div class="variants">${currentVariants(lead).map((variant) => variantCard(lead, variant)).join('')}</div>
  <section class="decision"><div><span class="section-label">Want different options?</span><h2>Regenerate three designs</h2><p>Write what you want changed. The local remix uses the approved photo pool, alternate copy, and design cues such as menu-first, elegant, bright, dark, green, or warm. Your notes stay with this restaurant for later refinement.</p></div><label for="review-note">Design notes for the next three</label><textarea id="review-note" rows="3" placeholder="For example: brighter, more menu-first, less formal…">${escapeHtml(decision?.note || '')}</textarea><div class="decision__actions"><button type="button" data-regenerate>Regenerate 3 options ↻</button>${decision?.selectedVariantId ? '<button type="button" data-clear>Clear selection</button>' : ''}<span id="save-status" role="status"></span></div><p class="decision__storage">Choices and notes stay on this computer in <code>.local/selections.json</code>. Nothing is sent.</p></section>` : `<section class="queue"><span class="section-label">Next research pass</span><h2>Review public presence, then prepare three concepts.</h2><p>The CSV is a lead, not a verified brief. Check the current site, menu, business identity, brand cues, and image rights before adding this client to the pilot research file.</p><details><summary>Original lead notes</summary><p><b>Website note:</b> ${escapeHtml(lead.existingWebsiteNote)}</p><p><b>Problem evidence:</b> ${escapeHtml(lead.problemEvidence)}</p><p><b>Caveats:</b> ${escapeHtml(lead.caveats || 'None recorded')}</p><p><b>Source log:</b> ${escapeHtml(lead.sourceLogReference)}</p>${lead.otherLinks.length ? `<ul>${lead.otherLinks.map((url) => `<li>${safeUrl(url) ? `<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>` : escapeHtml(url)}</li>`).join('')}</ul>` : ''}</details></section>`}
  ${imageInventory.leads[lead.id] ? imageGallery(lead) : ''}
  <details class="csv-notes"><summary>Lead CSV evidence and caveats</summary><p>${escapeHtml(lead.problemEvidence)}</p><p><b>To confirm:</b> ${escapeHtml(lead.caveats || 'No caveat recorded in CSV')}</p><p><b>Source:</b> ${escapeHtml(lead.sourceLogReference)}</p></details>`;
}

function imageGallery(lead: Lead): string {
  const inventory = imageInventory.leads[lead.id];
  const photos = inventory.images;
  const google = inventory.google;
  return `<section class="restaurant-images"><div><span class="section-label">Restaurant image inventory</span><h2>${photos.length} site image links · ${google?.results.length || 0} Google image leads</h2><p>Choose an image for this restaurant’s concept previews, or let each direction use a different site candidate. The chosen template image is saved as WebP when creating the HTML draft. Check identity and reuse rights before sending.</p></div><div class="restaurant-images__grid">${photos.map((photo) => `<div><img src="${escapeHtml(safeUrl(photo.imageUrl))}" alt="${escapeHtml(photo.alt || 'Restaurant website image')}" loading="lazy"><button type="button" data-image-url="${escapeHtml(photo.imageUrl)}">${selections[lead.id]?.imageUrl === photo.imageUrl ? 'Selected' : 'Use image'}</button><a href="${escapeHtml(safeUrl(photo.pageUrl))}" target="_blank" rel="noopener noreferrer">Source ↗</a></div>`).join('')}</div>${google ? `<details><summary>Google image search · ${google.results.length} results</summary><p>${escapeHtml(google.status)}</p><p><a href="${escapeHtml(safeUrl(google.searchUrl))}" target="_blank" rel="noopener noreferrer">Open Google Images ↗</a></p><div class="restaurant-images__grid">${google.results.map((item) => `<div><img src="${escapeHtml(safeUrl(item.imageUrl))}" alt="${escapeHtml(item.title || 'Google image search result')}" loading="lazy"><button type="button" data-image-url="${escapeHtml(item.imageUrl)}">${selections[lead.id]?.imageUrl === item.imageUrl ? 'Selected' : 'Use image'}</button><a href="${escapeHtml(safeUrl(item.pageUrl))}" target="_blank" rel="noopener noreferrer">Source ↗</a></div>`).join('')}</div></details>` : ''}${inventory.errors.length ? `<details><summary>${inventory.errors.length} collection issues</summary><ul>${inventory.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></details>` : ''}</section>`;
}

async function saveDecision(next: Decision): Promise<void> {
  const updated = { ...selections, [activeId]: { ...selections[activeId], ...next } };
  const response = await fetch('/__review/selections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
  if (!response.ok) throw new Error(`Save failed (${response.status})`);
  selections = updated;
}

function flashcardView(lead: Lead): string {
  const research = lead.research!;
  const ready = data.leads.filter((item) => item.research);
  const remaining = ready.filter((item) => !chosen(item)).length;
  const preview = currentVariants(lead).find((variant) => variant.id === previewVariantId);
  if (preview) {
    const number = currentVariants(lead).indexOf(preview) + 1;
    return `<section class="flow-panel flashcard flashcard--expanded" role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div class="flow-top"><button type="button" data-back-options>← Three options</button><span>${escapeHtml(lead.name)} · OPTION 0${number}</span><button type="button" data-open-checkout>Checkout ${chosenLeads().length}</button></div>
      <div class="expanded-heading"><div><span class="section-label">Website direction 0${number} of 03</span><h1 id="preview-title">${escapeHtml(preview.label)}</h1></div><span>${previewPhoto(lead, preview).restaurant ? 'Restaurant site candidate · rights unverified' : 'Illustrative concept · licensed imagery'}</span></div>
      <div class="expanded-site">${homepage(lead, preview, true)}</div>
      <div class="expanded-actions"><button type="button" data-back-options>← Back to three options</button><button type="button" data-select="${escapeHtml(preview.id)}">${chosen(lead)?.id === preview.id ? '✓ Checked · continue to next restaurant' : '✓ Check this option · next restaurant'}</button></div>
    </section>`;
  }
  return `<section class="flow-panel flashcard" role="dialog" aria-modal="true" aria-labelledby="flashcard-title">
    <div class="flow-top"><button class="flow-exit" type="button" data-exit-flash aria-label="Exit flashcards to checkout">← Exit</button><span>FLASHCARD REVIEW · ${remaining} TO CHOOSE</span><button type="button" data-open-checkout>Checkout ${chosenLeads().length}</button></div>
    <div class="flashcard__intro"><div><span class="section-label">Restaurant ${ready.findIndex((item) => item.id === lead.id) + 1} of ${ready.length}</span><h1 id="flashcard-title">${escapeHtml(lead.name)}</h1><p>${escapeHtml([lead.category, lead.cityArea].filter(Boolean).join(' · '))}</p></div><div class="flashcard__brief"><p><b>About</b>${escapeHtml(short(research.vibe, 160))}</p><p><b>Needs</b>${escapeHtml(needs(lead))}</p></div></div>
    <div class="flashcard__choices">${currentVariants(lead).map((variant, index) => `<article class="flash-choice"><div class="flash-choice__heading"><span>0${index + 1}</span><h2>${escapeHtml(variant.label)}</h2></div><button class="flash-choice__open" type="button" data-preview="${escapeHtml(variant.id)}" aria-label="Open full screen preview of ${escapeHtml(variant.label)}">${homepage(lead, variant)}<span class="flash-choice__open-label">View full screen ↗</span></button><p class="flash-choice__why"><b>Why this design</b>${escapeHtml(designIntent(variant.layout))}</p></article>`).join('')}</div>
    <div class="flashcard__gallery"><div><span class="section-label">Images gathered</span><p>${restaurantPhotos(lead).length ? 'Restaurant site image links. Reuse rights need confirmation.' : 'Illustrative licensed photos, not restaurant photography.'}</p></div><div class="flashcard__gallery-grid">${restaurantPhotos(lead).length ? restaurantPhotos(lead).slice(0, 12).map((photo) => `<img src="${escapeHtml(safeUrl(photo.imageUrl))}" alt="${escapeHtml(photo.alt || 'Restaurant site image')}" loading="lazy">`).join('') : research.photoPool.map((id) => { const asset = assetMap.get(id); return asset ? `<img src="${escapeHtml(asset.smallImage)}" alt="${escapeHtml(asset.alt)}" loading="lazy">` : ''; }).join('')}</div></div>
  </section>`;
}

function checkoutView(): string {
  const selected = chosenLeads();
  const remaining = data.leads.filter((lead) => lead.research && !chosen(lead)).length;
  return `<section class="flow-panel checkout" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div class="flow-top"><button class="flow-exit" type="button" data-close-flow>← Review workspace</button><span>CHECKOUT</span><button type="button" data-open-ready>Ready to send <b>${readyDrafts().length}</b></button></div><div class="flow-heading"><span class="section-label">Selected directions</span><h1 id="checkout-title">Your checkout</h1><p>${selected.length} selected · ${remaining} prepared restaurant${remaining === 1 ? '' : 's'} still awaiting a choice.</p></div><div class="checkout-grid">${selected.map((lead) => { const variant = chosen(lead)!; const photo = previewPhoto(lead, variant); return `<article class="checkout-card"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt)}" loading="lazy"><div><span class="section-label">${escapeHtml(lead.cityArea)}</span><h2>${escapeHtml(lead.name)}</h2><strong>${escapeHtml(variant.label)}</strong><p>${escapeHtml(designIntent(variant.layout))}</p><button type="button" data-flash-lead="${escapeHtml(lead.id)}">Change choice</button></div></article>`; }).join('') || '<p class="empty-flow">No sites selected yet. Open Flashcards to choose a direction.</p>'}</div><div class="checkout-actions"><button type="button" data-open-flash>Review ${remaining ? 'remaining' : 'flashcards'}</button><button type="button" data-create-emails ${selected.length ? '' : 'disabled'}>Create ${selected.length} HTML email template${selected.length === 1 ? '' : 's'} →</button><span id="flow-status" role="status"></span></div></section>`;
}


async function emailImage(lead: Lead, variant: Variant): Promise<string> {
  const photo = previewPhoto(lead, variant);
  if (photo.restaurant) {
    const response = await fetch('/__review/selected-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, imageUrl: photo.url }) });
    const result = await response.json() as { dataUrl?: string; error?: string };
    if (!response.ok || !result.dataUrl) throw new Error(result.error || `Could not save selected image (${response.status})`);
    return result.dataUrl;
  }
  const asset = assetMap.get(variant.heroAssetId)!;
  const response = await fetch(asset.smallImage);
  if (!response.ok) throw new Error(`Could not load concept photo (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(bitmap.width, 900);
  canvas.height = Math.round(bitmap.height * canvas.width / bitmap.width);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp', .82);
}

function emailMarkup(lead: Lead, variant: Variant, image: string): string {
  const ink = safeColor(variant.colors.ink), paper = safeColor(variant.colors.paper), accent = safeColor(variant.colors.accent);
  const subject = lead.name;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background:#eeeae3;font-family:Arial,sans-serif"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eeeae3"><tr><td align="center" style="padding:24px 10px"><table role="presentation" cellpadding="0" cellspacing="0" width="640" style="width:100%;max-width:640px;background:${paper};border-collapse:collapse"><tr><td style="padding:20px 24px;background:${ink};color:#fff;font-family:Georgia,serif;font-size:21px;font-weight:bold">${escapeHtml(lead.name)}</td><td align="right" style="padding:20px 24px;background:${ink};color:#fff;font-size:10px;white-space:nowrap">WEBSITE &nbsp; ORDERING &nbsp; GROWTH</td></tr><tr><td colspan="2"><img src="${image}" width="640" alt="Restaurant website concept photograph" style="display:block;width:100%;height:auto;border:0"></td></tr><tr><td colspan="2" style="padding:28px 26px 34px;border-top:6px solid ${accent};background:${paper};color:${ink}"><p style="margin:0 0 12px;color:${accent};font-size:10px;font-weight:bold;letter-spacing:2px">HAI SOLUTIONS · RESTAURANT WEB DESIGN</p><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:48px;line-height:1.06">${escapeHtml(lead.name)}</h1><p style="margin:0 0 22px;font-size:18px;line-height:1.5">${escapeHtml(serviceBlurb(variant.layout))}</p><a href="https://www.haiconsultingservices.com/" style="display:inline-block;padding:13px 18px;background:${accent};color:#fff;text-decoration:none;font-size:12px;font-weight:bold">See what HAI can build ↗</a></td></tr><tr><td colspan="2" style="padding:20px 26px;background:${ink};color:#fff;font-size:12px;line-height:1.5"><strong style="display:block;margin-bottom:6px;font-family:Georgia,serif;font-size:21px">Built around your restaurant</strong>Custom websites &nbsp;·&nbsp; Direct ordering &nbsp;·&nbsp; Search visibility</td></tr></table></td></tr></table></body></html>`;
}

async function emailTemplate(lead: Lead, variant: Variant): Promise<EmailDraft> {
  const photo = previewPhoto(lead, variant);
  const image = await emailImage(lead, variant);
  const subject = lead.name;
  const html = emailMarkup(lead, variant, image);
  return { leadId: lead.id, variantId: variant.id, imageUrl: photo.url, subject, html, createdOn: new Date().toISOString(), templateVersion: 4 };
}

function readyView(): string {
  const drafts = readyDrafts();
  return `<section class="flow-panel ready" role="dialog" aria-modal="true" aria-labelledby="ready-title"><div class="flow-top"><button class="flow-exit" type="button" data-open-checkout>← Checkout</button><span>EMAIL TEMPLATES</span><button type="button" data-close-flow>Review workspace</button></div><div class="flow-heading"><span class="section-label">Ready to send</span><h1 id="ready-title">HTML email templates</h1><p>${drafts.length} current template${drafts.length === 1 ? '' : 's'}. Review, copy, or download the HTML. Sending is not connected yet.</p></div><div class="ready-actions"><button type="button" data-download-all ${drafts.length ? '' : 'disabled'}>Download all HTML (.zip)</button><span id="flow-status" role="status"></span></div><div class="ready-grid${drafts.length === 1 ? ' ready-grid--single' : ''}">${drafts.map((draft) => { const lead = data.leads.find((item) => item.id === draft.leadId)!; return `<article class="ready-card"><div><span class="section-label">${escapeHtml(lead.cityArea)}</span><h2>${escapeHtml(lead.name)}</h2><p><b>Subject:</b> ${escapeHtml(draft.subject)}</p><small>Recipient email to add when sending is connected</small></div><iframe title="Email preview for ${escapeHtml(lead.name)}" sandbox srcdoc="${escapeHtml(draft.html)}"></iframe><div class="ready-card__actions"><button type="button" data-copy-html="${escapeHtml(lead.id)}">Copy HTML</button><button type="button" data-download-html="${escapeHtml(lead.id)}">Download HTML</button></div></article>`; }).join('') || '<p class="empty-flow">No current email templates. Choose sites in Flashcards, then create HTML templates from Checkout.</p>'}</div></section>`;
}

function download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function render(resetScroll = true): void {
  const lead = data.leads.find((item) => item.id === activeId) || data.leads[0];
  activeId = lead.id;
  const detailPane = document.querySelector<HTMLElement>('#detail')!;
  const previousScroll = detailPane.scrollTop;
  document.querySelector<HTMLElement>('#lead-list')!.innerHTML = nav();
  detailPane.innerHTML = detail(lead);
  detailPane.scrollTop = resetScroll ? 0 : previousScroll;
  const overlay = document.querySelector<HTMLElement>('#flow-overlay')!;
  const workspace = document.querySelector<HTMLElement>('.workspace')!;
  overlay.hidden = view === 'detail';
  overlay.innerHTML = view === 'flashcard' ? flashcardView(lead) : view === 'checkout' ? checkoutView() : view === 'ready' ? readyView() : '';
  workspace.classList.toggle('is-blurred', view !== 'detail');
  workspace.inert = view !== 'detail';
  document.querySelector<HTMLElement>('#ready-count')!.textContent = String(readyDrafts().length);
  document.querySelector<HTMLElement>('#checkout-count')!.textContent = String(chosenLeads().length);
  if (view !== 'detail') overlay.scrollTop = 0;
  history.replaceState(null, '', `#${encodeURIComponent(activeId)}`);
}

async function init(): Promise<void> {
  const response = await fetch('/__review/data');
  if (!response.ok) throw new Error('Run npm run prepare:leads to prepare the local lead queue.');
  data = await response.json() as ReviewData;
  const selectionsResponse = await fetch('/__review/selections');
  if (selectionsResponse.ok) selections = await selectionsResponse.json() as Selections;
  const draftsResponse = await fetch('/__review/email-drafts');
  if (draftsResponse.ok) emailDrafts = await draftsResponse.json() as EmailDrafts;
  const inventoryResponse = await fetch('/__review/image-inventory');
  if (inventoryResponse.ok) imageInventory = await inventoryResponse.json() as ImageInventory;
  activeId = decodeURIComponent(location.hash.slice(1));
  if (!data.leads.some((lead) => lead.id === activeId)) activeId = data.leads.find((lead) => lead.research)?.id || data.leads[0]?.id;
  app.innerHTML = `<header class="app-header"><a href="/" aria-label="FOH showcase home"><span class="brand-mark">FOH</span><span>FRONT OF HOUSE<small>LOCAL SAMPLE REVIEW</small></span></a><nav class="app-header__actions" aria-label="Review views"><button type="button" data-open-flash>Flashcards</button><button type="button" data-open-checkout>Checkout <span id="checkout-count">0</span></button><button type="button" data-open-ready>Ready to send <span id="ready-count" class="alert-count">0</span></button></nav></header><div class="workspace"><aside class="sidebar"><div class="sidebar__heading"><div><span class="section-label">Lead queue</span><h2>Restaurant clients</h2></div><span>${data.leads.length}</span></div><label class="search-label" for="lead-search">Search leads</label><input id="lead-search" type="search" placeholder="Name, cuisine, area…" autocomplete="off"/><nav id="lead-list" class="lead-list" aria-label="Restaurant leads"></nav></aside><main id="detail" class="detail"></main></div><div id="flow-overlay" class="flow-overlay" hidden></div>`;
  document.querySelector<HTMLInputElement>('#lead-search')!.addEventListener('input', (event) => { filter = (event.target as HTMLInputElement).value.trim().toLowerCase(); document.querySelector<HTMLElement>('#lead-list')!.innerHTML = nav(); });
  app.addEventListener('click', async (event) => {
    const target = event.target as Element;
    if (target.closest('[data-open-flash]')) { previewVariantId = null; activeId = data.leads.find((lead) => lead.research && !chosen(lead))?.id || data.leads.find((lead) => lead.research)!.id; view = 'flashcard'; render(); return; }
    const flashLead = target.closest<HTMLButtonElement>('[data-flash-lead]');
    if (flashLead) { previewVariantId = null; activeId = flashLead.dataset.flashLead!; view = 'flashcard'; render(); return; }
    if (target.closest('[data-back-options]')) { previewVariantId = null; render(); return; }
    const previewButton = target.closest<HTMLButtonElement>('[data-preview]');
    if (previewButton) { previewVariantId = previewButton.dataset.preview!; render(); document.querySelector<HTMLButtonElement>('[data-back-options]')?.focus(); return; }
    if (target.closest('[data-open-checkout], [data-exit-flash]')) { previewVariantId = null; view = 'checkout'; render(); return; }
    if (target.closest('[data-open-ready]')) { view = 'ready'; render(); return; }
    if (target.closest('[data-close-flow]')) { view = 'detail'; render(false); return; }
    const imageButton = target.closest<HTMLButtonElement>('[data-image-url]');
    if (imageButton) {
      const previous = selections[activeId];
      await saveDecision({ selectedVariantId: previous?.selectedVariantId || null, note: previous?.note || '', round: previous?.round, generatedVariants: previous?.generatedVariants, imageUrl: imageButton.dataset.imageUrl!, updatedOn: new Date().toISOString() });
      render(false);
      return;
    }
    if (target.closest('[data-create-emails]')) {
      const status = document.querySelector<HTMLElement>('#flow-status');
      try {
        const updated = { ...emailDrafts };
        await Promise.all(chosenLeads().map(async (lead) => { updated[lead.id] = await emailTemplate(lead, chosen(lead)!); }));
        const response = await fetch('/__review/email-drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
        if (!response.ok) throw new Error(`Could not save email templates (${response.status})`);
        emailDrafts = updated; view = 'ready'; render();
      } catch (error) { if (status) status.textContent = String(error); }
      return;
    }
    const copyButton = target.closest<HTMLButtonElement>('[data-copy-html]');
    if (copyButton) { const draft = emailDrafts[copyButton.dataset.copyHtml!]; if (draft) { await navigator.clipboard.writeText(draft.html); const status = document.querySelector<HTMLElement>('#flow-status'); if (status) status.textContent = 'HTML copied'; } return; }
    const downloadButton = target.closest<HTMLButtonElement>('[data-download-html]');
    if (downloadButton) { const lead = data.leads.find((item) => item.id === downloadButton.dataset.downloadHtml)!; download(new Blob([emailDrafts[lead.id].html], { type: 'text/html;charset=utf-8' }), `${fileName(lead)}-email.html`); return; }
    if (target.closest('[data-download-all]')) { const zip = new JSZip(); readyDrafts().forEach((draft) => { const lead = data.leads.find((item) => item.id === draft.leadId)!; zip.file(`${fileName(lead)}-email.html`, draft.html); }); download(await zip.generateAsync({ type: 'blob' }), 'foh-email-templates.zip'); return; }
    const leadButton = target.closest<HTMLButtonElement>('[data-lead]');
    if (leadButton) { view = 'detail'; activeId = leadButton.dataset.lead!; render(); return; }
    const lead = data.leads.find((item) => item.id === activeId)!;
    const selection = target.closest<HTMLButtonElement>('[data-select]');
    const regenButton = target.closest<HTMLButtonElement>('[data-regenerate]');
    const clear = target.closest<HTMLButtonElement>('[data-clear]');
    if (!selection && !regenButton && !clear) return;
    const status = document.querySelector<HTMLElement>('#save-status');
    const note = document.querySelector<HTMLTextAreaElement>('#review-note')?.value || '';
    const previous = selections[lead.id];
    const round = previous?.round || 0;
    try {
      if (regenButton) {
        await saveDecision({ selectedVariantId: null, note, updatedOn: new Date().toISOString(), round: round + 1, generatedVariants: regenerate(lead, round + 1, note) });
        render(false);
        document.querySelector<HTMLElement>('.variants-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (selection) {
        await saveDecision({ selectedVariantId: selection.dataset.select!, note, updatedOn: new Date().toISOString(), round, generatedVariants: previous?.generatedVariants });
        previewVariantId = null;
        const next = nextReadyLead(lead.id);
        if (next) activeId = next.id;
        else view = 'checkout';
        render();
      } else {
        await saveDecision({ selectedVariantId: null, note, updatedOn: new Date().toISOString(), round, generatedVariants: previous?.generatedVariants });
        render(false);
      }
      const saved = document.querySelector<HTMLElement>('#save-status');
      if (saved) saved.textContent = regenButton ? 'Three new options ready' : 'Saved locally';
    }
    catch (error) { if (status) status.textContent = String(error); }
  });
  render();
}

init().catch((error) => { app.innerHTML = `<main class="load-error"><h1>Review data unavailable</h1><p>${escapeHtml(error)}</p><code>npm run prepare:leads</code></main>`; });
