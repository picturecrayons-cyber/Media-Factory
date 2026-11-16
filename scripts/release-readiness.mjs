const required = {
  oci: ["OCI_TENANCY_OCID", "OCI_USER_OCID", "OCI_PRIVATE_KEY", "OCI_REGION", "OCI_NAMESPACE", "OCI_BUCKET_NAME"],
  ociRecovery: ["OCI_RECOVERY_BUCKET_NAME"],
  supabase: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"],
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
};

function present(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function oneOf(...names) {
  return names.some(present);
}

const primaryBucket = process.env.OCI_BUCKET_NAME?.trim();
const recoveryBucket = process.env.OCI_RECOVERY_BUCKET_NAME?.trim();

const results = {
  oci: required.oci.every(present),
  ociRecovery:
    required.ociRecovery.every(present) &&
    Boolean(primaryBucket) &&
    Boolean(recoveryBucket) &&
    primaryBucket !== recoveryBucket,
  supabase: required.supabase.every(present),
  razorpay: required.razorpay.every(present),
  hostingerMail:
    present("MAIL_FROM") &&
    oneOf("SMTP_HOST", "HOSTINGER_SMTP_HOST") &&
    present("SMTP_PORT") &&
    oneOf("SMTP_USER", "HOSTINGER_SMTP_USER") &&
    oneOf("SMTP_PASS", "HOSTINGER_SMTP_PASS"),
};

const details = {
  oci: required.oci.filter((k) => !present(k)),
  ociRecovery: [
    ...required.ociRecovery.filter((k) => !present(k)),
    ...(!primaryBucket ? ["OCI_BUCKET_NAME"] : []),
    ...(primaryBucket && recoveryBucket && primaryBucket === recoveryBucket
      ? ["OCI_RECOVERY_BUCKET_NAME must differ from OCI_BUCKET_NAME"]
      : []),
  ],
  supabase: required.supabase.filter((k) => !present(k)),
  razorpay: required.razorpay.filter((k) => !present(k)),
  hostingerMail: [
    ...(!present("MAIL_FROM") ? ["MAIL_FROM"] : []),
    ...(!oneOf("SMTP_HOST", "HOSTINGER_SMTP_HOST") ? ["SMTP_HOST|HOSTINGER_SMTP_HOST"] : []),
    ...(!present("SMTP_PORT") ? ["SMTP_PORT"] : []),
    ...(!oneOf("SMTP_USER", "HOSTINGER_SMTP_USER") ? ["SMTP_USER|HOSTINGER_SMTP_USER"] : []),
    ...(!oneOf("SMTP_PASS", "HOSTINGER_SMTP_PASS") ? ["SMTP_PASS|HOSTINGER_SMTP_PASS"] : []),
  ],
};

console.log("Crayons Bridge release-readiness environment audit");
console.log("OCI_FINGERPRINT is optional: production runtime derives it from OCI_PRIVATE_KEY when absent.");
console.log("OCI Recovery requires a configured bucket distinct from the Primary bucket.");
for (const [name, ok] of Object.entries(results)) {
  console.log(`${ok ? "PASS" : "BLOCKED"}  ${name}`);
  if (!ok) console.log(`  missing/invalid: ${details[name].join(", ")}`);
}

const blocked = Object.values(results).some((ok) => !ok);
if (blocked) {
  console.error("\nEnvironment readiness is incomplete. This script does not certify E2E behavior.");
  process.exit(1);
}

console.log("\nEnvironment variables are present. Real E2E evidence is still required before certification.");
