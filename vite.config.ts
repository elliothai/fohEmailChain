import { defineConfig, type Plugin } from 'vite';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';

const localDir = join(import.meta.dirname, '.local');
async function publicImageUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid image URL');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|fc|fd|fe80)/i.test(address))) throw new Error('Image host is not public');
  return url;
}
async function selectedWebp(raw: string): Promise<Buffer> {
  let url = await publicImageUrl(raw);
  for (let i = 0; i < 4; i++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { url = await publicImageUrl(new URL(response.headers.get('location') || '', url).href); continue; }
    if (!response.ok || !/^image\/(avif|webp|jpeg|png)(;|$)/i.test(response.headers.get('content-type') || '')) throw new Error(`Image download failed (${response.status})`);
    if (Number(response.headers.get('content-length') || 0) > 12_000_000) throw new Error('Image exceeds 12 MB');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 12_000_000) throw new Error('Image exceeds 12 MB');
    return sharp(bytes, { limitInputPixels: 60_000_000 }).rotate().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  }
  throw new Error('Too many image redirects');
}
function reviewApi(): Plugin {
  return {
    name: 'local-review-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__review/')) return next();
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) { res.writeHead(403).end(); return; }
        if (req.url === '/__review/selected-image') {
          if (req.method !== 'POST' || req.headers.origin !== `http://${req.headers.host}` || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end(); return; }
          try {
            let body = '';
            for await (const chunk of req) { body += chunk; if (body.length > 10_000) throw new Error('Invalid request size'); }
            const { leadId, imageUrl } = JSON.parse(body) as { leadId: string; imageUrl: string };
            if (!/^[a-z0-9-]+$/.test(leadId)) throw new Error('Invalid lead ID');
            const inventory = JSON.parse(await readFile(join(localDir, 'image-inventory.json'), 'utf8'));
            const lead = inventory.leads?.[leadId];
            if (!lead?.images?.some((image: { imageUrl: string }) => image.imageUrl === imageUrl) && !lead?.google?.results?.some((image: { imageUrl: string }) => image.imageUrl === imageUrl)) throw new Error('Image is not in this restaurant inventory');
            const webp = await selectedWebp(imageUrl);
            await mkdir(join(localDir, 'selected-images'), { recursive: true });
            await writeFile(join(localDir, 'selected-images', `${leadId}.webp`), webp);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ dataUrl: `data:image/webp;base64,${webp.toString('base64')}` }));
          } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(error) })); }
          return;
        }
        const file = req.url === '/__review/data' ? 'lead-review.json' : req.url === '/__review/selections' ? 'selections.json' : req.url === '/__review/email-drafts' ? 'email-drafts.json' : req.url === '/__review/image-inventory' ? 'image-inventory.json' : null;
        if (!file) { res.writeHead(404).end(); return; }
        if (req.method === 'GET') {
          try {
            const data = await readFile(join(localDir, file), 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(data);
          } catch { res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Run npm run prepare:leads first.' })); }
          return;
        }
        if (req.method !== 'POST' || !['selections.json', 'email-drafts.json'].includes(file)) { res.writeHead(405).end(); return; }
        if (req.headers.origin !== `http://${req.headers.host}` || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end(); return; }
        try {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 5_000_000) throw new Error('Review file is too large');
          }
          const parsed = JSON.parse(body) as Record<string, unknown>;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid review data');
          const data = JSON.stringify(parsed, null, 2) + '\n';
          await mkdir(localDir, { recursive: true });
          await writeFile(join(localDir, `${file}.tmp`), data);
          await rename(join(localDir, `${file}.tmp`), join(localDir, file));
          res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"saved":true}');
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(error) }));
        }
      });
    },
  };
}
export default defineConfig({ server: { fs: { deny: ['**/.local/**'] } }, plugins: [reviewApi()] });
