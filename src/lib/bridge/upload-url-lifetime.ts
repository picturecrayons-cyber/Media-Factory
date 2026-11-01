/** Write-link lifetime. Files up to 512 MiB keep a 15-minute link.
 * A film master gets one hour of slack at 1 MiB/s, capped at 12 hours. */
export function uploadUrlLifetimeSeconds(byteSize: number | undefined) {
  if (byteSize == null || !Number.isSafeInteger(byteSize) || byteSize <= 512 * 1024 * 1024) return 900;
  const seconds = Math.ceil(byteSize / (1024 * 1024)) + 3600;
  return Math.min(12 * 3600, seconds);
}
