import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { MongoClient, GridFSBucket, ObjectId } from 'mongodb';

const root = path.resolve('.local-data');
let client;
let database;
let bucket;
let local = false;

function uri() {
  const { MONGODB_HOST, MONGODB_USER, MONGODB_PASSWORD } = process.env;
  if (!MONGODB_HOST) return null;
  return `mongodb+srv://${encodeURIComponent(MONGODB_USER)}:${encodeURIComponent(MONGODB_PASSWORD)}@${MONGODB_HOST}/?retryWrites=true&w=majority`;
}

export async function initStore() {
  if (!uri()) {
    if (process.env.VERCEL === '1') throw new Error('MONGODB_HOST ausente');
    local = true;
    await fs.mkdir(path.join(root, 'blobs'), { recursive: true });
    try { await fs.access(path.join(root, 'items.json')); }
    catch { await fs.writeFile(path.join(root, 'items.json'), '[]'); }
    return 'local';
  }
  client = new MongoClient(uri(), { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 });
  await client.connect();
  database = client.db(process.env.MONGODB_DB || 'arquivo');
  await database.command({ ping: 1 });
  bucket = new GridFSBucket(database, { bucketName: 'content' });
  await database.collection('items').createIndex({ parentId: 1, deletedAt: 1 });
  await database.collection('items').createIndex({ shareHash: 1 }, { sparse: true });
  return 'mongodb';
}

export function mode() { return local ? 'local' : 'mongodb'; }
async function readLocal() { return JSON.parse(await fs.readFile(path.join(root, 'items.json'), 'utf8')); }
async function writeLocal(items) { await fs.writeFile(path.join(root, 'items.json'), JSON.stringify(items, null, 2)); }
function serial(item) { return item ? { ...item, _id: String(item._id), blobId: item.blobId && String(item.blobId) } : null; }

export async function listItems() {
  const items = local ? await readLocal() : await database.collection('items').find({}).toArray();
  return items.map(serial);
}
export async function getItem(id) {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const item = local ? (await readLocal()).find(x => x._id === id) : await database.collection('items').findOne({ _id: new ObjectId(id) });
  return serial(item);
}
export async function addItem(item) {
  const value = { ...item, _id: new ObjectId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null, favorite: false };
  if (local) { const items = await readLocal(); items.push(serial(value)); await writeLocal(items); }
  else await database.collection('items').insertOne(value);
  return serial(value);
}
export async function patchItem(id, changes) {
  if (local) {
    const items = await readLocal(); const item = items.find(x => x._id === id);
    if (!item) return null;
    Object.assign(item, changes, { updatedAt: new Date().toISOString() }); await writeLocal(items); return item;
  }
  const result = await database.collection('items').findOneAndUpdate({ _id: new ObjectId(id) }, { $set: { ...changes, updatedAt: new Date().toISOString() } }, { returnDocument: 'after' });
  return serial(result);
}
export async function removeItem(id) {
  const item = await getItem(id);
  if (!item) return;
  if (item.type === 'file' && item.blobId) {
    if (local) await fs.rm(path.join(root, 'blobs', item.blobId), { force: true });
    else await bucket.delete(new ObjectId(item.blobId));
  }
  if (local) await writeLocal((await readLocal()).filter(x => x._id !== id));
  else await database.collection('items').deleteOne({ _id: new ObjectId(id) });
}
export async function saveBlob(buffer, filename, mime) {
  if (local) {
    const id = crypto.randomBytes(16).toString('hex');
    await fs.writeFile(path.join(root, 'blobs', id), buffer);
    return id;
  }
  const stream = bucket.openUploadStream(filename, { metadata: { mime } });
  await pipeline((await import('node:stream')).Readable.from(buffer), stream);
  return String(stream.id);
}
export function blobStream(id) {
  return local ? createReadStream(path.join(root, 'blobs', id)) : bucket.openDownloadStream(new ObjectId(id));
}
