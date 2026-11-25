/**
 * Text <-> bytes for the file formats (ZIP names, DBF fields, PDF objects).
 *
 * Only UTF-8 is available from the runtime — Hermes has TextEncoder, and Expo's TextDecoder
 * polyfill decodes UTF-8 and nothing else — but older shapefiles are Latin-1 / Windows-1252, and
 * PDF syntax is bytes. Those are decoded by hand here rather than by a `TextDecoder('latin1')`
 * that would throw on the device while working fine in a desktop test.
 */

const encoder = new TextEncoder();

export function utf8Encode(text: string): Uint8Array {
  return encoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** One char per byte. Exact for ISO-8859-1, and close enough to Windows-1252 for attribute text. */
export function latin1Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x2000) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x2000)));
  }
  return out;
}

/** Strict UTF-8 check — used to decide how to read a DBF that carries no `.cpg`. */
export function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      i++;
      continue;
    }
    let extra: number;
    if (b >= 0xc2 && b <= 0xdf) extra = 1;
    else if (b >= 0xe0 && b <= 0xef) extra = 2;
    else if (b >= 0xf0 && b <= 0xf4) extra = 3;
    else return false;
    for (let k = 1; k <= extra; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return false;
    }
    i += extra + 1;
  }
  return true;
}

/** UTF-8 if it is valid UTF-8, Latin-1 otherwise — the pragmatic reading of unlabelled text. */
export function decodeText(bytes: Uint8Array, hint?: string | null): string {
  const label = hint?.trim().toLowerCase() ?? '';
  if (label.includes('utf') && label.includes('8')) return utf8Decode(bytes);
  if (label && /(1252|8859|latin|ansi|ascii)/.test(label)) return latin1Decode(bytes);
  return isValidUtf8(bytes) ? utf8Decode(bytes) : latin1Decode(bytes);
}
