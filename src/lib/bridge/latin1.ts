/** HTTP headers and btoa accept only code points 0-255. */
export function toLatin1(value: string): string {
  return Array.from(value, (ch) => (ch.charCodeAt(0) <= 255 ? ch : "_")).join("");
}

export function asciiUploadName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).replace(/[^a-zA-Z0-9.]/g, "") : "";
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60);
  return `${base || "upload"}${ext}`;
}
