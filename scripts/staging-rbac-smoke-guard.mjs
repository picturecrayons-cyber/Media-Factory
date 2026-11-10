/**
 * Hard stop for all STAGING DB smoke access until CRA-128 Phase 0 is
 * independently accepted and a later reviewed change explicitly opens the gate.
 * Do not replace this with an environment-variable self-attestation.
 */
export const CRA128_PHASE0_ACCEPTED = false;

export function assertCra128Phase0Accepted() {
  if (!CRA128_PHASE0_ACCEPTED) {
    throw new Error("CRA-128 Phase 0 is not independently accepted; STAGING DB access is disabled.");
  }
}
