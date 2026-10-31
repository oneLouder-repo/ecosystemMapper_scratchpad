/**
 * A small streaming .zip writer, for the browser and the server alike.
 *
 * Files are stored, not compressed: audio is compressed already, and storing
 * means the archive's exact size is known before a byte is sent (so a
 * download can show its progress) and files stream straight through. Each
 * file's checksum is worked out as it passes and written after it (a "data
 * descriptor"). Archives past 4 GB use the zip64 records, which every
 * current unzip tool reads.
 *
 *   const entries = [{ name: 'index.html', size, data: Uint8Array | AsyncIterable<Uint8Array> }, …];
 *   zipSize(entries)                       → bytes
 *   for await (const part of zipStream(entries)) …   → Uint8Array pieces
 */
const U32 = 0xffffffff;
const enc = new TextEncoder();

let table;
/** CRC-32 (the zip checksum), carried on from `crc` across pieces. */
export function crc32(bytes, crc = 0) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = (crc ^ U32) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ U32) >>> 0;
}


/** The archive's size in bytes, before it is written. */
export function zipSize(entries, { zip64At = U32 } = {}) {
  const needs64 = (n) => n >= zip64At;
  let offset = 0;
  let central = 0;
  for (const e of entries) {
    const name = enc.encode(e.name).length;
    central += 46 + name + (needs64(offset) ? 12 : 0);
    offset += 30 + name + e.size + 16;
  }
  const big = needs64(offset) || needs64(central) || entries.length >= 0xffff;
  return offset + central + (big ? 56 + 20 : 0) + 22;
}

/** DOS date and time, which zip files use. */
function dosTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function bytes(size, write) {
  const buf = new Uint8Array(size);
  write(new DataView(buf.buffer));
  return buf;
}

/**
 * Write the archive, piece by piece. `crc` can be swapped for a faster one
 * (Node's zlib.crc32) with the same (bytes, previous) signature.
 */
export async function* zipStream(entries, { crc = crc32, date = new Date(), zip64At = U32 } = {}) {
  // zip64At: where the zip64 records start (lower it only to test them).
  const needs64 = (n) => n >= zip64At;
  const { time, date: day } = dosTime(date);
  const records = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    // Bit 3: sizes and checksum follow the data. Bit 11: the name is UTF-8.
    const flags = 0x0808;
    yield bytes(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, flags, true);
      v.setUint16(8, 0, true);
      v.setUint16(10, time, true);
      v.setUint16(12, day, true);
      // crc and sizes left at 0: they come in the descriptor.
      v.setUint16(26, name.length, true);
    });
    yield name;
    let sum = 0;
    let written = 0;
    const pieces = e.data instanceof Uint8Array ? [e.data] : e.data;
    for await (const piece of pieces) {
      const p = piece instanceof Uint8Array ? piece : new Uint8Array(piece);
      sum = crc(p, sum) >>> 0;
      written += p.length;
      yield p;
    }
    if (written !== e.size) throw new Error(`${e.name} was ${written} bytes, not the ${e.size} expected`);
    yield bytes(16, (v) => {
      v.setUint32(0, 0x08074b50, true);
      v.setUint32(4, sum, true);
      v.setUint32(8, written, true);
      v.setUint32(12, written, true);
    });
    records.push({ name, crc: sum, size: written, offset });
    offset += 30 + name.length + written + 16;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const r of records) {
    const z64 = needs64(r.offset);
    const extra = z64 ? 12 : 0;
    yield bytes(46, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, z64 ? 45 : 20, true); // made by
      v.setUint16(6, z64 ? 45 : 20, true); // needed
      v.setUint16(8, 0x0808, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, time, true);
      v.setUint16(14, day, true);
      v.setUint32(16, r.crc, true);
      v.setUint32(20, r.size, true);
      v.setUint32(24, r.size, true);
      v.setUint16(28, r.name.length, true);
      v.setUint16(30, extra, true);
      v.setUint32(42, z64 ? U32 : r.offset, true);
    });
    yield r.name;
    if (z64) yield bytes(12, (v) => { v.setUint16(0, 0x0001, true); v.setUint16(2, 8, true); v.setBigUint64(4, BigInt(r.offset), true); });
    cdSize += 46 + r.name.length + extra;
  }

  const big = needs64(cdStart) || needs64(cdSize) || records.length >= 0xffff;
  if (big) {
    const z64End = cdStart + cdSize;
    yield bytes(56, (v) => {
      v.setUint32(0, 0x06064b50, true);
      v.setBigUint64(4, 44n, true);
      v.setUint16(12, 45, true);
      v.setUint16(14, 45, true);
      v.setBigUint64(24, BigInt(records.length), true);
      v.setBigUint64(32, BigInt(records.length), true);
      v.setBigUint64(40, BigInt(cdSize), true);
      v.setBigUint64(48, BigInt(cdStart), true);
    });
    yield bytes(20, (v) => {
      v.setUint32(0, 0x07064b50, true);
      v.setBigUint64(8, BigInt(z64End), true);
      v.setUint32(16, 1, true);
    });
  }
  yield bytes(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, big ? 0xffff : records.length, true);
    v.setUint16(10, big ? 0xffff : records.length, true);
    v.setUint32(12, big ? U32 : cdSize, true);
    v.setUint32(16, big ? U32 : cdStart, true);
  });
}
