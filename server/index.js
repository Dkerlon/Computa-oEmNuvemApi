import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initStore, mode, listItems, getItem, addItem, patchItem, removeItem, saveBlob, blobStream } from './store.js';

export const app = express();
const secret = process.env.SESSION_SECRET || 'development-only-secret';
const password = process.env.APP_PASSWORD || 'change-me';
const port = Number(process.env.PORT || 3030);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

function signed(value) { return `${value}.${crypto.createHmac('sha256', secret).update(value).digest('hex')}`; }
function authed(req) {
  const raw = req.cookies.arquivo_session || '';
  const index = raw.lastIndexOf('.');
  if (index < 0) return false;
  const value = raw.slice(0, index);
  const expected = signed(value);
  return expected.length === raw.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(raw)) && Number(value) > Date.now();
}
function auth(req, res, next) { if (!authed(req)) return res.status(401).json({ error: 'Faça login para continuar.' }); next(); }
async function available(item) {
  const seen = new Set();
  let current = item;
  while (current) {
    if (current.deletedAt || seen.has(current._id)) return false;
    seen.add(current._id);
    current = current.parentId ? await getItem(current.parentId) : null;
  }
  return true;
}
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const localDev = ['localhost:3030', '127.0.0.1:3030'].includes(req.get('host'));
  if (origin && new URL(origin).host !== req.get('host') && !(localDev && ['localhost:5173', '127.0.0.1:5173'].includes(new URL(origin).host))) return res.status(403).json({ error: 'Origem não permitida.' });
  next();
}
app.use('/api', sameOrigin);

app.get('/api/status', (req, res) => res.json({ authenticated: authed(req), mode: mode() }));
app.post('/api/login', (req, res) => {
  const given = Buffer.from(String(req.body.password || ''));
  const expected = Buffer.from(password);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return res.status(401).json({ error: 'Senha incorreta.' });
  const expiry = String(Date.now() + 7 * 86400000);
  res.cookie('arquivo_session', signed(expiry), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 86400000 });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie('arquivo_session'); res.json({ ok: true }); });
app.get('/api/items', auth, async (req, res, next) => { try { res.json(await listItems()); } catch (e) { next(e); } });
app.post('/api/folders', auth, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Informe o nome da pasta.' });
    const parentId = req.body.parentId || null;
    if (parentId) { const parent = await getItem(parentId); if (!parent || parent.type !== 'folder' || parent.deletedAt) return res.status(400).json({ error: 'Pasta de destino inválida.' }); }
    res.status(201).json(await addItem({ type: 'folder', name, parentId }));
  } catch (e) { next(e); }
});
app.post('/api/files', auth, upload.array('files', 1), async (req, res, next) => {
  try {
    const parentId = req.body.parentId || null;
    if (parentId) { const parent = await getItem(parentId); if (!parent || parent.type !== 'folder' || parent.deletedAt) return res.status(400).json({ error: 'Pasta de destino inválida.' }); }
    if (!req.files?.length) return res.status(400).json({ error: 'Selecione pelo menos um arquivo.' });
    const saved = [];
    for (const file of req.files) {
      const name = path.basename(file.originalname).slice(0, 180);
      const blobId = await saveBlob(file.buffer, name, file.mimetype);
      saved.push(await addItem({ type: 'file', name, parentId, size: file.size, mime: file.mimetype, blobId }));
    }
    res.status(201).json(saved);
  } catch (e) { next(e); }
});
app.patch('/api/items/:id', auth, async (req, res, next) => {
  try {
    const item = await getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
    const changes = {};
    if (typeof req.body.name === 'string') { const name = req.body.name.trim().slice(0, 180); if (!name) return res.status(400).json({ error: 'Nome inválido.' }); changes.name = name; }
    if (typeof req.body.favorite === 'boolean') changes.favorite = req.body.favorite;
    if (req.body.deletedAt === 'now') changes.deletedAt = new Date().toISOString();
    if (req.body.deletedAt === null) changes.deletedAt = null;
    if (Object.hasOwn(req.body, 'parentId')) {
      const target = req.body.parentId;
      if (target === item._id) return res.status(400).json({ error: 'Destino inválido.' });
      if (target) {
        const folder = await getItem(target);
        if (!folder || folder.type !== 'folder' || !(await available(folder))) return res.status(400).json({ error: 'Pasta de destino inválida.' });
        let parent = folder;
        while (parent) { if (parent._id === item._id) return res.status(400).json({ error: 'Não é possível mover uma pasta para dentro dela mesma.' }); parent = parent.parentId ? await getItem(parent.parentId) : null; }
      }
      changes.parentId = target || null;
    }
    res.json(await patchItem(item._id, changes));
  } catch (e) { next(e); }
});
app.delete('/api/items/:id', auth, async (req, res, next) => {
  try {
    const item = await getItem(req.params.id);
    if (!item || !item.deletedAt) return res.status(400).json({ error: 'Mova o item para a lixeira antes de excluir.' });
    const items = await listItems();
    const ids = new Set([item._id]);
    let changed = true;
    while (changed) { changed = false; for (const child of items) if (child.parentId && ids.has(child.parentId) && !ids.has(child._id)) { ids.add(child._id); changed = true; } }
    for (const id of ids) await removeItem(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/items/:id/share', auth, async (req, res, next) => {
  try {
    const item = await getItem(req.params.id);
    if (!item || item.type !== 'file' || !(await available(item))) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    const token = crypto.randomBytes(24).toString('base64url');
    await patchItem(item._id, { shareHash: crypto.createHash('sha256').update(token).digest('hex'), shareExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
    res.json({ url: `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}/api/share/${token}`, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  } catch (e) { next(e); }
});
app.delete('/api/items/:id/share', auth, async (req, res, next) => { try { const item = await getItem(req.params.id); if (!item) return res.sendStatus(404); await patchItem(item._id, { shareHash: null, shareExpiresAt: null }); res.json({ ok: true }); } catch (e) { next(e); } });
function download(item, res) {
  res.setHeader('Content-Type', item.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', item.size);
  blobStream(item.blobId).on('error', () => { if (!res.headersSent) res.sendStatus(404); else res.destroy(); }).pipe(res);
}
app.get('/api/items/:id/download', auth, async (req, res, next) => { try { const item = await getItem(req.params.id); if (!item || item.type !== 'file' || !(await available(item))) return res.sendStatus(404); download(item, res); } catch (e) { next(e); } });
app.get('/api/share/:token', async (req, res, next) => {
  try {
    const hash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const item = (await listItems()).find(x => x.shareHash === hash && x.shareExpiresAt && new Date(x.shareExpiresAt) > new Date() && !x.deletedAt);
    if (!item || !(await available(item))) return res.status(404).send('Link inválido ou expirado.');
    download(item, res);
  } catch (e) { next(e); }
});
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
app.use(express.static(dist));
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
app.use((err, req, res, next) => { console.error(err.message); res.status(err instanceof multer.MulterError ? 400 : 500).json({ error: err instanceof multer.MulterError ? 'Envie um arquivo de até 4 MB por vez.' : 'Não foi possível concluir a operação.' }); });

const ready = initStore();
export async function handler(req, res) {
  try { await ready; return app(req, res); }
  catch (error) { console.error('Falha ao conectar ao MongoDB:', error.message); return res.status(503).json({ error: 'Banco de dados indisponível. Verifique a conexão e a lista de IPs do Atlas.' }); }
}
if (process.env.VERCEL !== '1') {
  try { const activeMode = await ready; app.listen(port, () => console.log(`Arquivo API em http://127.0.0.1:${port} (${activeMode})`)); }
  catch (error) { console.error('Falha ao conectar ao MongoDB:', error.message); process.exit(1); }
}
