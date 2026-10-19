import { Buffer } from "node:buffer";

export type ImageDimensions = { width: number; height: number };

function jpegExifOrientation(bytes: Buffer, start: number, end: number): number | null {
  if (end - start < 14 || bytes.toString("ascii", start, start + 6) !== "Exif\0\0") return null;
  const tiff = start + 6;
  const byteOrder = bytes.toString("ascii", tiff, tiff + 2);
  const little = byteOrder === "II";
  if (!little && byteOrder !== "MM") return null;
  const read16 = (offset: number) => little ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  const read32 = (offset: number) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  if (tiff + 8 > end || read16(tiff + 2) !== 42) return null;
  const ifd = tiff + read32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = read16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (read16(entry) !== 0x0112) continue;
    if (read16(entry + 2) !== 3 || read32(entry + 4) !== 1) return null;
    const value = read16(entry + 8);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** Read dimensions from common raster image headers; JPEG EXIF orientation is applied. */
export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  const b = Buffer.from(bytes);
  if (b.length < 12) return null;

  if (
    b.length >= 24 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.toString("ascii", 12, 16) === "IHDR"
  ) {
    const width = b.readUInt32BE(16);
    const height = b.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2;
    let orientation: number | null = null;
    while (offset + 4 <= b.length) {
      if (b[offset] !== 0xff) return null;
      while (offset < b.length && b[offset] === 0xff) offset++;
      if (offset >= b.length) return null;
      const marker = b[offset++];
      if (marker === 0xd9 || marker === 0xda) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > b.length) return null;
      const length = b.readUInt16BE(offset);
      if (length < 2 || offset + length > b.length) return null;
      const segmentStart = offset + 2;
      const segmentEnd = offset + length;
      if (marker === 0xe1) orientation = jpegExifOrientation(b, segmentStart, segmentEnd) ?? orientation;
      const isFrame = [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
        0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
      ].includes(marker);
      if (isFrame) {
        if (length < 7) return null;
        const height = b.readUInt16BE(offset + 3);
        const width = b.readUInt16BE(offset + 5);
        if (width <= 0 || height <= 0) return null;
        return orientation != null && orientation >= 5 && orientation <= 8
          ? { width: height, height: width }
          : { width, height };
      }
      offset += length;
    }
    return null;
  }

  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X" && b.length >= 30) {
      const width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
      const height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (chunk === "VP8 " && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      const width = b.readUInt16LE(26) & 0x3fff;
      const height = b.readUInt16LE(28) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
      const width = 1 + b[21] + ((b[22] & 0x3f) << 8);
      const height = 1 + (b[22] >> 6) + (b[23] << 2) + ((b[24] & 0x0f) << 10);
      return width > 0 && height > 0 ? { width, height } : null;
    }
  }

  return null;
}
