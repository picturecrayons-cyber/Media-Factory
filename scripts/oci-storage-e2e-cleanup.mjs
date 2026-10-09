/**
 * Cleanup for the OCI/Bridge E2E. This helper is intentionally dependency-injected
 * so its success, partial-failure, and rollback paths can be tested without OCI or DB
 * credentials and without touching a real fixture.
 */
export async function cleanupOciE2E({
  runKeys,
  deleteObject,
  objectExists,
  rollback,
  verifyDatabaseState,
}) {
  const errors = [];
  const uniqueKeys = [...new Set(runKeys)];

  // Delete in reverse creation order. Keys are run-unique and registered before PUT,
  // so a failed/ambiguous PUT is still safe to clean (404 is treated as absent).
  for (const key of [...uniqueKeys].reverse()) {
    try {
      await deleteObject(key);
      if (await objectExists(key)) {
        throw new Error("object still exists after delete");
      }
    } catch {
      errors.push("run-owned object deletion/absence verification failed");
    }
  }

  let rolledBack = false;
  try {
    await rollback();
    rolledBack = true;
  } catch {
    errors.push("database transaction rollback failed");
  }

  // Verify fixture state only after a successful rollback. Never attempt compensating
  // UPDATEs that might overwrite a concurrent change; the row locks + transaction
  // make the test writes atomic and ROLLBACK restores the original committed state.
  if (rolledBack && verifyDatabaseState) {
    try {
      await verifyDatabaseState();
    } catch {
      errors.push("fixture state verification after rollback failed");
    }
  }

  if (errors.length) {
    throw new Error(`CLEANUP_INCOMPLETE: ${errors.join("; ")}`);
  }

  return {
    cleanedObjectCount: uniqueKeys.length,
    databaseRolledBack: rolledBack,
    fixtureVerified: Boolean(verifyDatabaseState),
  };
}
