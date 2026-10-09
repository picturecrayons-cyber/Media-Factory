/**
 * Cleanup for the OCI/Bridge E2E. Dependency-injected so cleanup paths can be
 * tested without OCI credentials or a real database fixture.
 */
const ROLLBACK_OUTCOMES = new Set(["restored", "already-original", "not-started"]);

export async function cleanupOciE2E({
  runKeys,
  deleteObject,
  objectExists,
  rollback,
  verifyDatabaseState,
}) {
  // A resolved callback is not proof of rollback: an early return can be a no-op.
  // Require an explicit outcome, then require independent DB read-back before
  // deleting any object that might still be referenced by database state.
  let rollbackResult;
  try {
    rollbackResult = await rollback();
  } catch {
    throw new Error("CLEANUP_INCOMPLETE: database compare-and-set rollback failed; retained OCI objects");
  }
  if (!rollbackResult || !ROLLBACK_OUTCOMES.has(rollbackResult.outcome)) {
    throw new Error("CLEANUP_INCOMPLETE: rollback callback did not prove a recognized outcome; retained OCI objects");
  }

  if (typeof verifyDatabaseState !== "function") {
    throw new Error("CLEANUP_INCOMPLETE: independent database state verification is required; retained OCI objects");
  }
  let verification;
  try {
    verification = await verifyDatabaseState();
  } catch {
    throw new Error("CLEANUP_INCOMPLETE: database state verification failed; retained OCI objects");
  }
  if (!verification || verification.verified !== true) {
    throw new Error("CLEANUP_INCOMPLETE: independent database verifier did not affirm restored state; retained OCI objects");
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
    rollbackOutcome: rollbackResult.outcome,
    databaseVerified: true,
  };
}
