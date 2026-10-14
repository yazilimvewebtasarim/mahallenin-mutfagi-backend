const { db } = require('../firebase');

/**
 * Kalıcı dosya deposu (Cloud Firestore üzerinde).
 *
 * Neden: Firebase Storage, projede faturalandırma (Blaze) olmadığı için kullanılamıyor;
 * Render'ın yerel diski ise her yeniden başlatma/deploy'da silinir.
 * Dosyalar ~900KB'lık parçalara bölünüp `uploads/{id}/chunks/{n}` altında saklanır.
 */

const CHUNK_SIZE = 900 * 1024; // Firestore doküman limiti 1 MiB
const MAX_CACHE_BYTES = 40 * 1024 * 1024; // Sunucu RAM önbelleği (Firestore okuma kotasını korur)

const cache = new Map(); // id -> { buffer, contentType }
let cacheBytes = 0;

function cacheGet(id) {
  const hit = cache.get(id);
  if (!hit) return null;
  // LRU: en sona taşı
  cache.delete(id);
  cache.set(id, hit);
  return hit;
}

function cacheSet(id, entry) {
  if (entry.buffer.length > MAX_CACHE_BYTES / 4) return;
  if (cache.has(id)) return;
  cache.set(id, entry);
  cacheBytes += entry.buffer.length;
  while (cacheBytes > MAX_CACHE_BYTES && cache.size > 0) {
    const [oldestId, oldest] = cache.entries().next().value;
    cache.delete(oldestId);
    cacheBytes -= oldest.buffer.length;
  }
}

/**
 * Dosya içeriğinden (magic bytes) gerçek türü tespit eder.
 * İstemcinin gönderdiği mimetype'a güvenilmez.
 */
function detectFileType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { contentType: 'image/jpeg', ext: 'jpg' };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { contentType: 'image/png', ext: 'png' };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { contentType: 'image/webp', ext: 'webp' };
  }
  if (buf.toString('ascii', 0, 5) === '%PDF-') {
    return { contentType: 'application/pdf', ext: 'pdf' };
  }
  // HEIC/HEIF (iPhone): ....ftypheic / ftypheix / ftypmif1 / ftyphevc
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return { contentType: 'image/heic', ext: 'heic' };
    }
  }
  return null;
}

async function saveFile(buffer, { contentType, folder, ownerId }) {
  const docRef = db.collection('uploads').doc();
  const chunkCount = Math.ceil(buffer.length / CHUNK_SIZE);

  const writes = [];
  for (let i = 0; i < chunkCount; i++) {
    const part = buffer.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    writes.push(docRef.collection('chunks').doc(String(i)).set({ i, data: part }));
  }
  await Promise.all(writes);

  // Meta veri en son yazılır: yarım kalan yüklemeler asla "hazır" görünmez
  await docRef.set({
    folder,
    ownerId: ownerId || null,
    contentType,
    size: buffer.length,
    chunkCount,
    createdAt: new Date().toISOString(),
  });

  cacheSet(docRef.id, { buffer, contentType });
  return docRef.id;
}

async function readFile(id) {
  const cached = cacheGet(id);
  if (cached) return cached;

  const docRef = db.collection('uploads').doc(id);
  const meta = await docRef.get();
  if (!meta.exists) return null;
  const { contentType, chunkCount, size } = meta.data();

  const chunksSnap = await docRef.collection('chunks').get();
  const parts = new Array(chunkCount);
  chunksSnap.forEach((d) => {
    const { i, data } = d.data();
    parts[i] = Buffer.from(data);
  });
  if (parts.some((p) => !p)) return null;

  const buffer = Buffer.concat(parts);
  if (typeof size === 'number' && buffer.length !== size) return null;

  const entry = { buffer, contentType };
  cacheSet(id, entry);
  return entry;
}

function _resetCache() {
  cache.clear();
  cacheBytes = 0;
}

module.exports = { saveFile, readFile, detectFileType, CHUNK_SIZE, _resetCache };
