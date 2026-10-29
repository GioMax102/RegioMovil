import { inflateSync } from 'node:zlib';

export const MAX_REPORT_PHOTO_BYTES = 400_000;
const MAX_PIXELS = 4_000_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const invalid = () => { throw new RangeError('La foto no tiene una estructura de imagen válida o supera el límite de 4 megapíxeles.'); };
function dimensions(width, height) {
  if (!width || !height || width > 4096 || height > 4096 || width * height > MAX_PIXELS) invalid();
}

function jpeg(data) {
  if (data.length < 4 || data.readUInt16BE(0) !== 0xffd8) invalid();
  const parts = [data.subarray(0, 2)];
  let offset = 2, frame = false, scan = false;
  while (offset < data.length) {
    const start = offset;
    if (data[offset++] !== 0xff) invalid();
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xd9) {
      if (!frame || !scan || offset !== data.length) invalid();
      parts.push(Buffer.from([0xff, 0xd9]));
      return Buffer.concat(parts);
    }
    if (!marker || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > data.length) invalid();
    const length = data.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > data.length) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (frame || length < 8 || data[offset + 2] !== 8) invalid();
      dimensions(data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3));
      frame = true;
    }
    if (marker === 0xda) {
      if (!frame || length < 6) invalid();
      scan = true;
      offset = end;
      while (offset < data.length) {
        if (data[offset] !== 0xff) { offset++; continue; }
        let next = offset + 1;
        while (data[next] === 0xff) next++;
        if (data[next] === 0x00 || (data[next] >= 0xd0 && data[next] <= 0xd7)) { offset = next + 1; continue; }
        break;
      }
      if (offset >= data.length) invalid();
      parts.push(data.subarray(start, offset));
    } else {
      // All application segments and comments may contain EXIF/GPS, XMP,
      // thumbnails or other identifying metadata. Never persist them.
      if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) {
        if (![0xc0, 0xc1, 0xc2, 0xc4, 0xdb, 0xdd].includes(marker)) invalid();
        parts.push(data.subarray(start, end));
      }
      offset = end;
    }
  }
  invalid();
}

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function png(data) {
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) invalid();
  const parts = [PNG_SIGNATURE], compressed = [];
  let offset = 8, header, ended = false, sawData = false, dataEnded = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset), end = offset + 12 + length;
    if (end > data.length) invalid();
    const type = data.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(data.subarray(offset + 4, end - 4)) !== data.readUInt32BE(end - 4)) invalid();
    const payload = data.subarray(offset + 8, end - 4);
    if (!header && type !== 'IHDR') invalid();
    if (type === 'IHDR') {
      if (header || length !== 13) invalid();
      const width = payload.readUInt32BE(0), height = payload.readUInt32BE(4);
      dimensions(width, height);
      const depth = payload[8], color = payload[9];
      if (!({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[color]?.includes(depth)) || payload[10] || payload[11] || payload[12] > 1) invalid();
      header = { width, height, bits: depth * ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color]), interlaced: payload[12] };
    }
    if (type === 'IDAT') {
      if (dataEnded) invalid();
      sawData = true; compressed.push(payload);
    } else if (sawData) dataEnded = true;
    if (type === 'IEND') {
      if (!sawData || length || end !== data.length) invalid();
      ended = true;
    }
    if (['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS'].includes(type)) parts.push(data.subarray(offset, end));
    else if (type[0] === type[0].toUpperCase()) invalid();
    offset = end;
    if (ended) break;
  }
  if (!header || !ended) invalid();
  // Bound decompression as well as encoded bytes; a tiny PNG can expand to
  // gigabytes. Verify scanline sizes for both regular PNG and Adam7 passes.
  let decoded;
  try { decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: 36_000_000 }); } catch { invalid(); }
  const passes = header.interlaced ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  let position = 0;
  for (const [x, y, dx, dy] of passes) {
    const width = Math.max(0, Math.ceil((header.width - x) / dx)), height = Math.max(0, Math.ceil((header.height - y) / dy));
    if (!width || !height) continue;
    const stride = Math.ceil(width * header.bits / 8) + 1;
    for (let row = 0; row < height; row++) { if (position >= decoded.length || decoded[position] > 4) invalid(); position += stride; }
  }
  if (position !== decoded.length) invalid();
  return Buffer.concat(parts);
}

function webp(data) {
  if (data.length < 20 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP' || data.readUInt32LE(4) !== data.length - 8) invalid();
  const parts = []; let offset = 12, image = false, extended = null, imageWidth, imageHeight;
  while (offset + 8 <= data.length) {
    const type = data.toString('ascii', offset, offset + 4), length = data.readUInt32LE(offset + 4), end = offset + 8 + length, padded = end + (length % 2);
    if (padded > data.length || !/^[A-Z0-9 ]{4}$/.test(type)) invalid();
    const payload = data.subarray(offset + 8, end);
    if (type === 'ANIM' || type === 'ANMF') invalid();
    if (type === 'VP8X') {
      if (extended || image || length !== 10 || payload[0] & 0x02) invalid();
      imageWidth = payload.readUIntLE(4, 3) + 1; imageHeight = payload.readUIntLE(7, 3) + 1;
      dimensions(imageWidth, imageHeight);
      extended = Buffer.from(data.subarray(offset, padded));
      extended[8] &= 0x10; // Retain alpha only; EXIF, XMP and ICC are removed.
      parts.push(extended);
    } else if (type === 'VP8 ' || type === 'VP8L') {
      if (image) invalid();
      let width, height;
      if (type === 'VP8 ') {
        if (length < 10 || !payload.subarray(3, 6).equals(Buffer.from([0x9d, 0x01, 0x2a])) || payload[0] & 1) invalid();
        width = payload.readUInt16LE(6) & 0x3fff; height = payload.readUInt16LE(8) & 0x3fff;
      } else {
        if (length < 5 || payload[0] !== 0x2f || payload[4] >> 5) invalid();
        const packed = payload.readUInt32LE(1);
        width = (packed & 0x3fff) + 1; height = ((packed >>> 14) & 0x3fff) + 1;
      }
      dimensions(width, height);
      if (extended && (width !== imageWidth || height !== imageHeight)) invalid();
      image = true; parts.push(data.subarray(offset, padded));
    } else if (type === 'ALPH') {
      if (!extended || image || !length) invalid();
      parts.push(data.subarray(offset, padded));
    }
    offset = padded;
  }
  if (!image || offset !== data.length) invalid();
  const body = Buffer.concat([Buffer.from('WEBP'), ...parts]), result = Buffer.alloc(8);
  result.write('RIFF'); result.writeUInt32LE(body.length, 4);
  return Buffer.concat([result, body]);
}

export function sanitizeReportPhoto(mime, data) {
  if (!Buffer.isBuffer(data)) data = Buffer.from(data);
  if (!data.length || data.length > MAX_REPORT_PHOTO_BYTES) invalid();
  const sanitizer = { 'image/jpeg': jpeg, 'image/png': png, 'image/webp': webp }[mime];
  if (!sanitizer) invalid();
  return sanitizer(data);
}

export function parseReportPhoto(value) {
  const match = typeof value === 'string' && value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) invalid();
  const mime = `image/${match[1]}`, data = Buffer.from(match[2], 'base64');
  if (data.toString('base64') !== match[2]) invalid();
  return { mime, data: sanitizeReportPhoto(mime, data) };
}
