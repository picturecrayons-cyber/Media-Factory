export const DIT_AGENT_CARD = {
  name: "Crayons Bridge DIT Agent",
  version: "0.1.0",
  capabilities: { streaming: false, pushNotifications: false, readOnly: true },
  skills: [
    { id: "ingest_integrity_check", name: "Ingest Integrity Check", mode: "read", description: "Validate source metadata and SHA-256 evidence without mutating Bridge assets." },
    { id: "backup_evidence_review", name: "Backup Evidence Review", mode: "read", description: "Review three independently located backup evidence records and compare byte size and SHA-256." },
    { id: "qc_readiness_review", name: "QC Readiness Review", mode: "read", description: "Report QC blockers; never approve QC or rights." },
    { id: "dit_signoff_readiness", name: "DIT Sign-off Readiness", mode: "read", description: "Evaluate whether evidence is ready for a human DIT operator sign-off." },
  ],
  safety: {
    agentMaySignOff: false,
    agentMayDeleteAssets: false,
    agentMayApproveRights: false,
    agentMayAuthorizeDelivery: false,
  },
} as const;
