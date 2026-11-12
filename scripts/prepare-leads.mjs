import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const local = join(root, '.local');
if (!process.argv[2]) throw new Error('Provide a lead CSV: npm run prepare:leads -- path/to/leads.csv');
const csvPath = resolve(process.argv[2]);

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field');
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const [header, ...values] = rows;
  if (!header?.includes('business_name')) throw new Error('Missing business_name column');
  return values.map((values, index) => {
    if (values.length !== header.length) throw new Error(`CSV row ${index + 2}: expected ${header.length} columns, got ${values.length}`);
    return Object.fromEntries(header.map((key, i) => [key.replace(/^\uFEFF/, ''), values[i]]));
  });
}

const slug = (value) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42);
const rows = parseCsv(await readFile(csvPath, 'utf8'));
const researchPath = process.argv[3] ? resolve(process.argv[3]) : join(local, 'pilot-research.json');
let research = { leads: [] };
try { research = JSON.parse(await readFile(researchPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn(`No curated research at ${researchPath}; preparing lead queue only.`);
}
const researchByName = new Map(research.leads.map((entry) => [entry.businessName, entry]));
const library = JSON.parse(await readFile(join(root, 'content/asset-library.json'), 'utf8'));
const scenes = JSON.parse(await readFile(join(root, 'content/showcase.json'), 'utf8'));
const assetIds = new Set(library.assets.map((asset) => asset.id));
const sceneIds = new Set(scenes.scenes.map((scene) => scene.id));
const ids = new Set();
const leads = rows.map((row) => {
  const name = row.business_name.trim();
  const fingerprint = createHash('sha256').update(`${name}|${row.address}|${row.city_area}`.toLowerCase()).digest('hex').slice(0, 7);
  const id = `${slug(name)}-${fingerprint}`;
  if (ids.has(id)) throw new Error(`Duplicate lead ID: ${id}`);
  ids.add(id);
  const brief = researchByName.get(name) || null;
  if (brief) {
    if (!Array.isArray(brief.sources) || !Array.isArray(brief.variants) || brief.variants.length !== 3) throw new Error(`${name}: research requires sources and exactly three variants`);
    if (!Array.isArray(brief.photoPool) || brief.photoPool.length < 6 || brief.photoPool.some((id) => !assetIds.has(id))) throw new Error(`${name}: six or more licensed photo IDs are required for regeneration`);
    if (!Array.isArray(brief.alternateCopy) || brief.alternateCopy.length < 6) throw new Error(`${name}: six alternate copy directions are required`);
    const photos = new Set();
    const layouts = new Set();
    for (const variant of brief.variants) {
      if (!assetIds.has(variant.heroAssetId) || !sceneIds.has(variant.sourceSceneId)) throw new Error(`${name}: unknown photo or scene`);
      const asset = library.assets.find((item) => item.id === variant.heroAssetId);
      if (asset.license !== 'CC0-1.0' || !asset.sourceUrl || !asset.licenseUrl || !asset.verifiedOn) throw new Error(`${name}: photo needs a verified CC0 record`);
      if (!Array.isArray(variant.menuItems) || variant.menuItems.length < 3) throw new Error(`${name}: variant menu is incomplete`);
      photos.add(variant.heroAssetId); layouts.add(variant.layout);
    }
    if (photos.size !== 3 || layouts.size !== 3) throw new Error(`${name}: variants must use distinct photos and compositions`);
    for (const id of brief.photoPool) {
      const asset = library.assets.find((item) => item.id === id);
      if (asset.license !== 'CC0-1.0' || !asset.sourceUrl || !asset.licenseUrl || !asset.verifiedOn) throw new Error(`${name}: remix photo needs a verified CC0 record`);
    }
  }
  return {
    id, name, category: row.category, address: row.address, cityArea: row.city_area,
    phone: row.phone, leadDate: row.date_found, rank: row.rank_that_day,
    existingWebsiteNote: row.website, otherLinks: row.other_links.split(/\s*\|\s*/).filter(Boolean),
    problemEvidence: row.problem_evidence, proposedFix: row.proposed_fix,
    caveats: row.caveats_to_confirm, sourceLogReference: row.source_log_reference,
    status: brief ? 'pilot ready' : 'research needed',
    research: brief && { ...brief, businessName: undefined },
  };
});
const unused = [...researchByName.keys()].filter((name) => !rows.some((row) => row.business_name.trim() === name));
if (unused.length) throw new Error(`Research names absent from CSV: ${unused.join(', ')}`);
await mkdir(local, { recursive: true });
await writeFile(join(local, 'lead-review.json'), JSON.stringify({ schemaVersion: 1, sourceCsv: csvPath, preparedOn: new Date().toISOString(), leads }, null, 2) + '\n');
console.log(`Prepared ${leads.length} leads: ${leads.filter((lead) => lead.research).length} with three reviewable variants, ${leads.filter((lead) => !lead.research).length} queued for research.`);
