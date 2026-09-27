const required = {
  aws: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"],
  mail: ["MAIL_FROM"],
  supabase: ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"],
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
};

function present(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function oneOf(...names) {
  return names.some(present);
}

const results = {
  aws: required.aws.every(present),
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
  aws: required.aws.filter((k) => !present(k)),
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
for (const [name, ok] of Object.entries(results)) {
  console.log(`${ok ? "PASS" : "BLOCKED"}  ${name}`);
  if (!ok) console.log(`  missing: ${details[name].join(", ")}`);
}

const blocked = Object.values(results).some((ok) => !ok);
if (blocked) {
  console.error("\nEnvironment readiness is incomplete. This script does not certify E2E behavior.");
  process.exit(1);
}

console.log("\nEnvironment variables are present. Real E2E evidence is still required before certification.");
