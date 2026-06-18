/** Pack/unpack a byte grid to/from base64 (compact world-map storage). */

export function encodeBytes(arr: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    s += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return typeof btoa !== "undefined" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
}

export function decodeBytes(b64: string, expected?: number): Uint8Array {
  if (!b64) return new Uint8Array(expected ?? 0);
  const s =
    typeof atob !== "undefined"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
