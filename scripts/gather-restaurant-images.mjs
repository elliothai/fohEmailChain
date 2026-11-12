import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = fileURLToPath(new URL('..', import.meta.url));
const local = join(root, '.local');
const args = process.argv.slice(2);
const option = (name, fallback = '') => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] || fallback; };
const all = args.includes('--all');
const leadArg = option('--lead');
const siteArg = option('--site');
const maxPages = Math.min(100, Math.max(1, Number(option('--max-pages', '30')) || 30));
const maxImages = Math.min(400, Math.max(1, Number(option('--max-images', '150')) || 150));
const googleKey = process.env.GOOGLE_CSE_API_KEY;
const googleCx = process.env.GOOGLE_CSE_CX;
const userAgent = 'FOHRestaurantImageResearch/1.0 (+local concept review)';
const excludedHosts = /(^|\.)(facebook|instagram|doordash|ubereats|grubhub|yelp|tripadvisor|exa\.ai|orders\.co|chownow|ezcater|beyondmenu|google|kwickmenu)\./i;

function webUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1|\[)/i.test(url.hostname)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}
const cleanUrl = (value, base) => webUrl(value, base)?.href || null;
function imageCandidates(value, srcset = false) {
  return (srcset ? String(value || '').split(/,\s+(?=\S)/) : [String(value || '')]).map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
}
function firstWebsite(lead) {
  const sources = [...(lead.research?.sources || []).map((source) => source.url), ...lead.otherLinks];
  return sources.map((url) => webUrl(url)).find((url) => url && !excludedHosts.test(url.hostname))?.href || null;
}
async function fetchLimited(url, accept, maxBytes = 12_000_000) {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: accept }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!response.ok || !webUrl(response.url)) throw new Error(`HTTP ${response.status} or unsafe redirect`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('file too large');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new Error('file too large'); }
    chunks.push(value);
  }
  return { response, buffer: Buffer.concat(chunks) };
}
function extract(html, pageUrl, host) {
  const $ = load(html);
  const images = new Map();
  const pages = new Set();
  const addImage = (value, hint = '', srcset = false) => {
    for (const candidate of imageCandidates(value, srcset)) {
      const url = cleanUrl(candidate, pageUrl);
      if (url && !images.has(url) && !/\.(svg|gif)(\?|$)/i.test(url)) images.set(url, hint.trim());
    }
  };
  $('img').each((_, el) => {
    const node = $(el);
    for (const key of ['src', 'data-src', 'data-lazy-src', 'data-original', 'srcset', 'data-srcset']) addImage(node.attr(key), node.attr('alt') || '', key.includes('srcset'));
  });
  $('source').each((_, el) => { addImage($(el).attr('srcset'), '', true); addImage($(el).attr('data-srcset'), '', true); });
  $('meta[property="og:image"],meta[name="twitter:image"],link[rel="image_src"]').each((_, el) => addImage($(el).attr('content') || $(el).attr('href')));
  $('[style]').each((_, el) => { for (const match of ($(el).attr('style') || '').matchAll(/url\(["']?([^)'"\s]+)["']?\)/gi)) addImage(match[1]); });
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const visit = (value, depth = 0) => {
        if (depth > 12 || !value || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
          if (key === 'image') {
            for (const image of [item].flat()) addImage(typeof image === 'string' ? image : image?.url || image?.contentUrl);
          } else visit(item, depth + 1);
        }
      };
      visit(JSON.parse($(el).text()));
    } catch { /* Ignore malformed structured data. */ }
  });
  $('a[href]').each((_, el) => {
    const url = webUrl($(el).attr('href'), pageUrl);
    if (!url || url.hostname !== host) return;
    if (/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url.href)) addImage(url.href, $(el).text());
    else if (!/\.(pdf|zip|docx?|mp4|webm)(\?|$)/i.test(url.href)) pages.add(url.href);
  });
  return { images, pages };
}
async function googleImages(lead) {
  const query = `"${lead.name}" ${lead.address || lead.cityArea} restaurant`;
  const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
  if (!googleKey || !googleCx) return { searchUrl, results: [], status: 'API credentials unavailable' };
  const results = [];
  for (const start of [1, 11, 21]) {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    for (const [key, value] of Object.entries({ key: googleKey, cx: googleCx, q: query, searchType: 'image', safe: 'active', num: '10', start: String(start) })) url.searchParams.set(key, value);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Google image search: HTTP ${response.status}`);
    const payload = await response.json();
    for (const item of payload.items || []) {
      const imageUrl = cleanUrl(item.link);
      const pageUrl = cleanUrl(item.image?.contextLink);
      if (imageUrl && pageUrl) results.push({ imageUrl, pageUrl, title: item.title || '', width: item.image?.width || null, height: item.image?.height || null });
    }
    if (!(payload.items || []).length || !payload.queries?.nextPage) break;
  }
  return { searchUrl, results, status: 'results gathered; source and rights need review' };
}
async function gather(lead) {
  const website = siteArg && !all ? cleanUrl(siteArg) : firstWebsite(lead);
  const record = { leadId: lead.id, name: lead.name, gatheredOn: new Date().toISOString(), website, sitePages: [], images: [], google: null, errors: [] };
  const found = new Map();
  if (website) {
    const site = new URL(website);
    const queue = [site.href], visited = new Set();
    while (queue.length && visited.size < maxPages && found.size < maxImages * 3) {
      const page = queue.shift();
      if (visited.has(page)) continue;
      visited.add(page);
      try {
        const { response, buffer } = await fetchLimited(page, 'text/html', 3_000_000);
        if (!response.headers.get('content-type')?.includes('text/html')) continue;
        if (new URL(response.url).hostname !== site.hostname) continue;
        record.sitePages.push(response.url);
        const extracted = extract(buffer.toString('utf8'), response.url, site.hostname);
        for (const [url, alt] of extracted.images) if (!found.has(url)) found.set(url, { alt, pageUrl: response.url });
        for (const url of extracted.pages) if (!visited.has(url) && !queue.includes(url)) queue.push(url);
      } catch (error) { record.errors.push(`${page}: ${error.message}`); }
    }
  } else record.errors.push('No restaurant website identified; pass --site URL to specify one.');
  record.images = [...found].slice(0, maxImages).map(([imageUrl, source]) => ({ imageUrl, pageUrl: source.pageUrl, alt: source.alt, source: 'restaurant site', rights: 'unverified', usableInOutreach: false }));
  try { record.google = await googleImages(lead); }
  catch (error) { record.google = { searchUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${lead.name} ${lead.address}`)}`, results: [], status: error.message }; }
  return record;
}

if (!all && !leadArg) throw new Error('Use --lead <name-or-id> [--site URL], or --all.');
const data = JSON.parse(await readFile(join(local, 'lead-review.json'), 'utf8'));
const leads = all ? data.leads : data.leads.filter((lead) => lead.id === leadArg || lead.name.toLowerCase().includes(leadArg.toLowerCase()));
if (!leads.length) throw new Error(`No lead matches ${leadArg}`);
if (!all && leads.length > 1) throw new Error('Lead name matches more than one row; pass its full ID.');
let inventory = { schemaVersion: 1, leads: {} };
try { inventory = JSON.parse(await readFile(join(local, 'image-inventory.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const lead of leads) {
  const record = await gather(lead);
  inventory.leads[lead.id] = record;
  await writeFile(join(local, 'image-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  console.log(`${lead.name}: ${record.sitePages.length} pages, ${record.images.length} unique site images, ${record.google?.results.length || 0} Google image leads, ${record.errors.length} issues`);
}
