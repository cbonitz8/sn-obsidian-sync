/**
 * Normalize content for comparison: trim trailing whitespace per line,
 * collapse trailing newlines to a single newline.
 */
export function normalizeContent(content: string): string {
  const lines = content.split("\n").map((line) => line.trimEnd());
  // Remove empty trailing lines, then ensure single trailing newline
  while (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n") + "\n";
}

/**
 * cyrb53 — fast 53-bit non-crypto hash.
 * Returns hex string for readability.
 */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Hash content after normalization. Two strings that differ only in
 * trailing whitespace or trailing newlines produce the same hash.
 */
export function contentHash(content: string): string {
  return cyrb53(normalizeContent(content));
}
