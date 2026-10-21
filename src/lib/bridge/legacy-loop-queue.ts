export async function advanceLegacyLoopQueueStatus(options: {
  queuePresent: boolean;
  confirmed: boolean;
  markUploaded: () => Promise<unknown>;
  markVerified: () => Promise<unknown>;
}): Promise<void> {
  if (!options.queuePresent) return;

  await options.markUploaded();
  if (options.confirmed) await options.markVerified();
}
