/**
 * A compact LZW string compressor.
 *
 * A full save is a large JSON document — roughly 2,400 players with 56 attributes each, plus
 * fixtures, ledgers and history. Raw, that comfortably exceeds the ~5MB localStorage quota. This
 * packs LZW dictionary codes into UTF-16 code units, which typically gets a save down to around a
 * fifth of its size and comfortably inside the budget.
 *
 * Implemented here rather than pulled from npm so the game has zero runtime dependencies beyond
 * React — it has to work offline from a static GitHub Pages host forever.
 *
 * The input is escaped to printable ASCII first. That matters: club names contain characters like
 * the apostrophe in "St James’ Park" and the em dash in commentary, and a naive LZW that emits
 * raw code points for single characters collides those (U+2019 = 8217) with its own dictionary
 * codes and corrupts the save. Escaping first keeps single characters inside 0-127 so dictionary
 * codes can start cleanly at 128.
 */

/** Codes 0-127 are literal ASCII; the dictionary starts above them. */
const ASCII_SIZE = 128;
/** Output code units are offset past the control range so the result is always storable. */
const BASE = 0x20;
/** Stay below the UTF-16 surrogate range so every output character is a valid lone code unit. */
const MAX_CODE = 0xd7ff - BASE;

/** Escape to printable ASCII. Backslashes are doubled so unescaping is unambiguous. */
function escapeToAscii(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const char = input[i];
    if (char === '\\') out += '\\\\';
    else if (code >= 0x20 && code <= 0x7e) out += char;
    else out += `\\u${code.toString(16).padStart(4, '0')}`;
  }
  return out;
}

function unescapeFromAscii(input: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] !== '\\') {
      parts.push(input[i]);
      i += 1;
      continue;
    }
    if (input[i + 1] === '\\') {
      parts.push('\\');
      i += 2;
      continue;
    }
    if (input[i + 1] === 'u') {
      parts.push(String.fromCharCode(parseInt(input.slice(i + 2, i + 6), 16)));
      i += 6;
      continue;
    }
    // Shouldn't happen for anything this module produced, but never lose data over it.
    parts.push(input[i]);
    i += 1;
  }
  return parts.join('');
}

export function compress(input: string): string {
  if (input === '') return '';
  const ascii = escapeToAscii(input);

  const dictionary = new Map<string, number>();
  let nextCode = ASCII_SIZE;
  const codes: number[] = [];

  let phrase = '';
  for (let i = 0; i < ascii.length; i++) {
    const char = ascii[i];
    const candidate = phrase + char;

    // Single characters are implicitly in the dictionary as their ASCII code.
    const known = candidate.length === 1 || dictionary.has(candidate);
    if (known) {
      phrase = candidate;
      continue;
    }

    codes.push(phrase.length === 1 ? phrase.charCodeAt(0) : dictionary.get(phrase)!);
    if (nextCode < MAX_CODE) dictionary.set(candidate, nextCode++);
    phrase = char;
  }
  if (phrase !== '') {
    codes.push(phrase.length === 1 ? phrase.charCodeAt(0) : dictionary.get(phrase)!);
  }

  // Build the output in chunks — String.fromCharCode has an argument limit.
  const chunks: string[] = [];
  const CHUNK = 8192;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK).map((code) => code + BASE);
    chunks.push(String.fromCharCode(...slice));
  }
  return chunks.join('');
}

export function decompress(input: string): string {
  if (input === '') return '';

  const dictionary = new Map<number, string>();
  let nextCode = ASCII_SIZE;
  const parts: string[] = [];

  const first = input.charCodeAt(0) - BASE;
  if (first >= ASCII_SIZE) throw new Error('Corrupt save data: bad header');
  let previous = String.fromCharCode(first);
  parts.push(previous);

  for (let i = 1; i < input.length; i++) {
    const code = input.charCodeAt(i) - BASE;
    let entry: string;

    if (code < ASCII_SIZE) {
      entry = String.fromCharCode(code);
    } else if (dictionary.has(code)) {
      entry = dictionary.get(code)!;
    } else if (code === nextCode) {
      // The classic LZW edge case: the code refers to the entry about to be created.
      entry = previous + previous[0];
    } else {
      throw new Error(`Corrupt save data at position ${i}`);
    }

    parts.push(entry);
    if (nextCode < MAX_CODE) dictionary.set(nextCode++, previous + entry[0]);
    previous = entry;
  }

  return unescapeFromAscii(parts.join(''));
}

/** Approximate size of a string in localStorage, which stores UTF-16. */
export function byteSize(str: string): number {
  return str.length * 2;
}
