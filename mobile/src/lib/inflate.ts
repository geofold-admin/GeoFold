/**
 * DEFLATE decoder (RFC 1951), for reading zipped shapefiles and the compressed streams inside a
 * GeoPDF. A transcription of zlib's reference decoder `contrib/puff/puff.c` — chosen over a faster
 * table-driven design because it is short enough to check line by line against the RFC, and the
 * inputs here are kilobytes to a few megabytes, decoded once on import.
 *
 * Dependency-free like the rest of the app's format code (`next/src/lib/export.ts` writes ZIP by
 * hand for the same reason). Verified against Node's zlib on stored, fixed and dynamic blocks —
 * see the checks recorded in NEXT-STEPS.md.
 */

const MAXBITS = 15;

// Length codes 257..285: base length and extra bits.
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
// Distance codes 0..29: base distance and extra bits.
const DBASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
// Order in which code-length code lengths are stored in a dynamic block header.
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  count: Uint16Array;
  symbol: Uint16Array;
}

class State {
  pos = 0;
  bitbuf = 0;
  bitcnt = 0;
  out: Uint8Array;
  outcnt = 0;
  input: Uint8Array;

  // Plain assignment rather than a `readonly input` parameter property: this file is also run
  // directly by Node's type stripping for its checks, which cannot erase parameter properties.
  constructor(input: Uint8Array, sizeHint: number) {
    this.input = input;
    this.out = new Uint8Array(Math.max(1024, sizeHint));
  }

  bits(need: number): number {
    let val = this.bitbuf;
    while (this.bitcnt < need) {
      if (this.pos >= this.input.length) throw new Error('Compressed data ends early.');
      val |= this.input[this.pos++] << this.bitcnt;
      this.bitcnt += 8;
    }
    this.bitbuf = val >>> need;
    this.bitcnt -= need;
    return val & ((1 << need) - 1);
  }

  ensure(extra: number) {
    if (this.outcnt + extra <= this.out.length) return;
    let size = this.out.length * 2;
    while (size < this.outcnt + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.out.subarray(0, this.outcnt));
    this.out = next;
  }
}

function construct(h: Huffman, lengths: ArrayLike<number>, n: number): number {
  h.count.fill(0);
  for (let s = 0; s < n; s++) h.count[lengths[s]]++;
  if (h.count[0] === n) return 0; // no codes — complete, but decode will fail
  let left = 1;
  for (let len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= h.count[len];
    if (left < 0) return left; // over-subscribed
  }
  const offs = new Uint16Array(MAXBITS + 1);
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + h.count[len];
  for (let s = 0; s < n; s++) if (lengths[s] !== 0) h.symbol[offs[lengths[s]]++] = s;
  return left;
}

function decode(s: State, h: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len <= MAXBITS; len++) {
    code |= s.bits(1);
    const count = h.count[len];
    if (code - count < first) return h.symbol[index + (code - first)];
    index += count;
    first += count;
    first <<= 1;
    code <<= 1;
  }
  throw new Error('Invalid Huffman code in compressed data.');
}

function codes(s: State, lencode: Huffman, distcode: Huffman): void {
  for (;;) {
    let symbol = decode(s, lencode);
    if (symbol < 256) {
      s.ensure(1);
      s.out[s.outcnt++] = symbol;
    } else if (symbol === 256) {
      return;
    } else {
      symbol -= 257;
      if (symbol >= 29) throw new Error('Invalid length code in compressed data.');
      const len = LBASE[symbol] + s.bits(LEXT[symbol]);
      const dsym = decode(s, distcode);
      if (dsym >= 30) throw new Error('Invalid distance code in compressed data.');
      const dist = DBASE[dsym] + s.bits(DEXT[dsym]);
      if (dist > s.outcnt) throw new Error('Distance too far back in compressed data.');
      s.ensure(len);
      // Byte by byte: a copy may overlap its own output (distance < length is how runs encode).
      for (let i = 0; i < len; i++) {
        s.out[s.outcnt] = s.out[s.outcnt - dist];
        s.outcnt++;
      }
    }
  }
}

function stored(s: State): void {
  s.bitbuf = 0;
  s.bitcnt = 0;
  if (s.pos + 4 > s.input.length) throw new Error('Compressed data ends early.');
  const len = s.input[s.pos] | (s.input[s.pos + 1] << 8);
  const nlen = s.input[s.pos + 2] | (s.input[s.pos + 3] << 8);
  if (len !== (~nlen & 0xffff)) throw new Error('Stored block length check failed.');
  s.pos += 4;
  if (s.pos + len > s.input.length) throw new Error('Compressed data ends early.');
  s.ensure(len);
  s.out.set(s.input.subarray(s.pos, s.pos + len), s.outcnt);
  s.outcnt += len;
  s.pos += len;
}

let fixedTables: { lencode: Huffman; distcode: Huffman } | null = null;

function fixed(): { lencode: Huffman; distcode: Huffman } {
  if (fixedTables) return fixedTables;
  const lengths = new Uint8Array(288);
  for (let i = 0; i < 144; i++) lengths[i] = 8;
  for (let i = 144; i < 256; i++) lengths[i] = 9;
  for (let i = 256; i < 280; i++) lengths[i] = 7;
  for (let i = 280; i < 288; i++) lengths[i] = 8;
  const lencode = { count: new Uint16Array(MAXBITS + 1), symbol: new Uint16Array(288) };
  construct(lencode, lengths, 288);
  const dl = new Uint8Array(30).fill(5);
  const distcode = { count: new Uint16Array(MAXBITS + 1), symbol: new Uint16Array(30) };
  construct(distcode, dl, 30);
  fixedTables = { lencode, distcode };
  return fixedTables;
}

function dynamic(s: State): void {
  const nlen = s.bits(5) + 257;
  const ndist = s.bits(5) + 1;
  const ncode = s.bits(4) + 4;
  if (nlen > 286 || ndist > 30) throw new Error('Bad dynamic block counts.');

  const lengths = new Uint8Array(320);
  for (let i = 0; i < ncode; i++) lengths[ORDER[i]] = s.bits(3);
  const lencode = { count: new Uint16Array(MAXBITS + 1), symbol: new Uint16Array(320) };
  if (construct(lencode, lengths, 19) !== 0) throw new Error('Incomplete code-length code.');

  lengths.fill(0);
  let index = 0;
  while (index < nlen + ndist) {
    const symbol = decode(s, lencode);
    if (symbol < 16) {
      lengths[index++] = symbol;
    } else {
      let len = 0;
      let repeat: number;
      if (symbol === 16) {
        if (index === 0) throw new Error('Repeat with no previous length.');
        len = lengths[index - 1];
        repeat = 3 + s.bits(2);
      } else if (symbol === 17) {
        repeat = 3 + s.bits(3);
      } else {
        repeat = 11 + s.bits(7);
      }
      if (index + repeat > nlen + ndist) throw new Error('Too many lengths.');
      while (repeat--) lengths[index++] = len;
    }
  }
  if (lengths[256] === 0) throw new Error('No end-of-block code.');

  const litcode = { count: new Uint16Array(MAXBITS + 1), symbol: new Uint16Array(286) };
  const err = construct(litcode, lengths, nlen);
  // An incomplete code is allowed only as a single one-bit code (puff.c's exact condition).
  if (err !== 0 && (err < 0 || nlen !== litcode.count[0] + litcode.count[1])) throw new Error('Incomplete literal/length code.');
  const distcode = { count: new Uint16Array(MAXBITS + 1), symbol: new Uint16Array(30) };
  const derr = construct(distcode, lengths.subarray(nlen), ndist);
  if (derr !== 0 && (derr < 0 || ndist !== distcode.count[0] + distcode.count[1])) throw new Error('Incomplete distance code.');

  codes(s, litcode, distcode);
}

/** Inflate a raw DEFLATE stream (as found in a ZIP entry). */
export function inflateRaw(input: Uint8Array, sizeHint = input.length * 4): Uint8Array {
  const s = new State(input, sizeHint);
  let last: number;
  do {
    last = s.bits(1);
    const type = s.bits(2);
    if (type === 0) stored(s);
    else if (type === 1) {
      const t = fixed();
      codes(s, t.lencode, t.distcode);
    } else if (type === 2) dynamic(s);
    else throw new Error('Invalid block type in compressed data.');
  } while (!last);
  return s.out.slice(0, s.outcnt);
}

/** Inflate a zlib-wrapped stream (RFC 1950) — what PDF's FlateDecode filter holds. */
export function inflateZlib(input: Uint8Array): Uint8Array {
  if (input.length < 2) throw new Error('Compressed data is empty.');
  const cmf = input[0];
  const flg = input[1];
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) {
    // Some writers emit raw deflate under FlateDecode; accept it rather than fail the import.
    return inflateRaw(input);
  }
  const offset = flg & 0x20 ? 6 : 2; // preset dictionary id follows the header if FDICT is set
  return inflateRaw(input.subarray(offset));
}
