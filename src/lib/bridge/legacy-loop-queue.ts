export async function markLegacyLoopQueueUploaded(
  queuePresent: boolean,
  update: () => Promise<unknown>,
): Promise<void> {
  if (queuePresent) await update();
}

export async function markLegacyLoopQueueVerified(
  queuePresent: boolean,
  confirmed: boolean,
  update: () => Promise<unknown>,
): Promise<void> {
  if (queuePresent && confirmed) await update();
}
