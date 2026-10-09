/**
 * Cleanup for the OCI/Bridge E2E. Dependency-injected so cleanup paths can be
 * tested without OCI credentials or a real database fixture.
 */
export async function cleanupOciE2E({
  runKeys,
  deleteObject,
  objectExists,
  rollback,
  verifyDatabaseState,
}) {
  // Restore/compare-and-set DB state before deleting any objects. If rollback
  // or independent read-back fails, retain objects that may still be referenced.
  try {
    await rollback();
  } catch {
    throw new Error("CLEANUP_INCOMPLETE: database compare-and-set rollback failed; retained OCI objects");
  }
  if (verifyDatabaseState) {
    try {
      await verifyDatabaseState();
    } catch {
      throw new Error("CLEANUP_INCOMPLETE: database state verification failed; retained OCI objects");
    }
  }

  const errors = [];
  const uniqueKeys = [...new Set(runKeys)];
  for (const key of [...uniqueKeys].reverse()) {
    try {
      await deleteObject(key);
      if (await objectExists(key)) throw new Error("object still exists after delete");
    } catch {
      errors.push("run-owned object deletion/absence verification failed");
    }
  }
  if (errors.length) throw new Error(`CLEANUP_INCOMPLETE: ${errors.join("; ")}`);

  return {
    cleanedObjectCount: uniqueKeys.length,
    databaseRolledBack: true,
    fixtureVerified: Boolean(verifyDatabaseState),
  };
}
