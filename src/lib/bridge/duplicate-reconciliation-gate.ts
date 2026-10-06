export async function assertDuplicateTitleLoopReleaseAllowed(sql: any, titleId: string) {
  const rows = await sql<{ blocked: boolean }>`
    select not public.bridge_duplicate_title_loop_release_allowed(${titleId}) as blocked
  `;
  if (rows[0]?.blocked) {
    throw new Error(
      "Loop release blocked: this Bridge title is a duplicate candidate under reconciliation review. Resolve the canonical identity review before publication."
    );
  }
}
