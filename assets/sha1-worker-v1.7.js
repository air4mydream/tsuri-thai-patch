/* Incremental SHA-1 for identifying user-selected local files.
 * Reads 2 MiB at a time; no network or storage APIs. */
'use strict';
class LocalSha1 {
  constructor() {
    this.h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
    this.words = new Uint32Array(80);
    this.tail = new Uint8Array(64);
    this.used = 0;
    this.length = 0;
    this.finished = false;
  }
  block(bytes, offset) {
    const w = this.words;
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      w[i] = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
    }
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (v << 1) | (v >>> 31);
    }
    let [a, b, c, d, e] = this.h;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
    }
    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
  }
  update(bytes) {
    if (this.finished) throw new Error('SHA-1 already finalized');
    this.length += bytes.length;
    let offset = 0;
    if (this.used) {
      const n = Math.min(64 - this.used, bytes.length);
      this.tail.set(bytes.subarray(0, n), this.used);
      this.used += n; offset = n;
      if (this.used === 64) { this.block(this.tail, 0); this.used = 0; }
    }
    for (; offset + 64 <= bytes.length; offset += 64) this.block(bytes, offset);
    if (offset < bytes.length) {
      this.tail.set(bytes.subarray(offset), 0);
      this.used = bytes.length - offset;
    }
    return this;
  }
  digest() {
    if (this.finished) throw new Error('SHA-1 already finalized');
    const padding = new Uint8Array(this.used < 56 ? 64 : 128);
    padding.set(this.tail.subarray(0, this.used));
    padding[this.used] = 0x80;
    const view = new DataView(padding.buffer);
    view.setUint32(padding.length - 8, Math.floor(this.length / 0x20000000), false);
    view.setUint32(padding.length - 4, (this.length * 8) >>> 0, false);
    for (let p = 0; p < padding.length; p += 64) this.block(padding, p);
    this.finished = true;
    return Array.from(this.h, n => n.toString(16).padStart(8, '0')).join('').toUpperCase();
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { LocalSha1 };
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async event => {
    const { file, jobId } = event.data || {};
    try {
      if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.slice !== 'function') {
        throw new Error('Invalid local file');
      }
      const sha1 = new LocalSha1();
      const chunkSize = 2 * 1024 * 1024;
      self.postMessage({ type: 'progress', jobId, done: 0, total: file.size });
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, file.size);
        const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
        if (bytes.length !== end - offset) throw new Error('Incomplete local file read');
        sha1.update(bytes);
        self.postMessage({ type: 'progress', jobId, done: end, total: file.size });
      }
      self.postMessage({ type: 'done', jobId, size: file.size, sha1: sha1.digest() });
    } catch {
      self.postMessage({ type: 'error', jobId, message: 'อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์จากเครื่องอีกครั้ง' });
    }
  };
}
