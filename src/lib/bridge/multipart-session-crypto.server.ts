import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypt persisted OCI PAR capabilities. Configure BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY
 * as a base64-encoded, randomly generated 32-byte key in each server environment.
 * Never reuse a client-exposed key or store this key in the database.
 */
function encryptionKey(): Buffer {
  const raw = typeof process === "undefined"
    ? undefined
    : process.env.BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("Multipart session encryption is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.byteLength !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    throw new Error("Multipart session encryption key must be base64-encoded 32-byte material");
  }
  return key;
}

export function encryptMultipartCapability(plaintext: string): string {
  if (!plaintext || plaintext.length > 8192) throw new Error("Invalid multipart capability");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptMultipartCapability(envelope: string): string {
  const [version, ivPart, tagPart, ciphertextPart, extra] = envelope.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart || extra) {
    throw new Error("Unsupported multipart capability envelope");
  }
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength > 8192) {
    throw new Error("Invalid multipart capability envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
