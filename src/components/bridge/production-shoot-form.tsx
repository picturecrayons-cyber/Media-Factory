/**
 * Production Shoot is not an Owner Submission.
 * This placeholder is intentionally read-only until a confirmed-project-gated
 * Studio Production workspace is implemented.
 */
export function ProductionShootForm() {
  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-live="polite">
      <h3 className="font-semibold">Studio Production</h3>
      <p className="mt-1 text-sm text-muted">
        Production Shoot creation is unavailable until a project has been formally
        confirmed and activated for this Studio. Buyer or investor interest alone
        does not authorize production. No production record has been created.
      </p>
    </section>
  );
}
