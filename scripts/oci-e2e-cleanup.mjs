/**
 * Run an external E2E operation and always attempt every applicable cleanup task.
 * Cleanup failures are never allowed to hide the original test failure.
 */
export async function runWithCleanup(run, getCleanupTasks) {
  let result;
  let runError;

  try {
    result = await run();
  } catch (error) {
    runError = error;
  }

  const cleanupErrors = [];
  for (const cleanup of getCleanupTasks()) {
    try {
      await cleanup.run();
    } catch (error) {
      cleanupErrors.push(
        new Error(cleanup.label, { cause: error }),
      );
    }
  }

  if (runError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [runError, ...cleanupErrors],
      "E2E operation failed and one or more test resources could not be cleaned up",
    );
  }
  if (runError) throw runError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "E2E cleanup failed");
  }

  return result;
}
