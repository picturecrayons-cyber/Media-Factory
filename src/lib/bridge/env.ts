import { resolveBridgeConfiguredOrigin } from "./origin.ts";
import { resolveBridgeSupabaseTarget } from "./supabase-target.ts";
function read(key: string): string | undefined {
  const v = typeof process === "undefined" ? undefined : process.env[key]?.trim();
  return v || undefined;
}

function deploymentEnvironment(): string {
  return (
    read("VERCEL_ENV") ||
    read("VITE_BRIDGE_ENVIRONMENT") ||
    read("VITE_BRIDGE_DEPLOY_ENV") ||
    (read("NODE_ENV") === "test" ? "test" : "production")
  );
}

function configuredSupabaseTarget() {
  return resolveBridgeSupabaseTarget(
    read("SUPABASE_URL") || read("VITE_SUPABASE_URL"),
    deploymentEnvironment(),
    read("EXPECTED_SUPABASE_PROJECT_REF") ||
      read("VITE_EXPECTED_SUPABASE_PROJECT_REF") ||
      read("VITE_BRIDGE_EXPECTED_SUPABASE_REF"),
  );
}

export const bridgeEnv = {
  supabaseUrl: () => configuredSupabaseTarget()?.url,
  supabaseProjectRef: () => configuredSupabaseTarget()?.projectRef,
  supabaseAnon: () => read("VITE_SUPABASE_PUBLISHABLE_KEY") || read("VITE_SUPABASE_ANON_KEY"),
  supabaseService: () => read("SUPABASE_SECRET_KEY") || read("SUPABASE_SERVICE_ROLE_KEY"),
  razorpayKeyId: () => read("RAZORPAY_KEY_ID"),
  razorpayKeySecret: () => read("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: () => read("RAZORPAY_WEBHOOK_SECRET"),
  ociTenancyOcid: () => read("OCI_TENANCY_OCID"),
  ociUserOcid: () => read("OCI_USER_OCID"),
  ociFingerprint: () => read("OCI_FINGERPRINT"),
  ociPrivateKey: () => read("OCI_PRIVATE_KEY") || read("PRIVATE_KEY"),
  ociRegion: () => read("OCI_REGION"),
  ociNamespace: () => read("OCI_NAMESPACE"),
  ociBucket: () => read("OCI_BUCKET_NAME"),
  // Legacy AWS/S3 compatibility adapter only; never used by production readiness.
  awsRegion: () => read("AWS_REGION"),
  awsBucket: () => read("AWS_S3_MEDIA_BUCKET") || read("S3_MEDIA_BUCKET") || read("AWS_S3_BUCKET"),
  awsAccessKeyId: () => read("AWS_ACCESS_KEY_ID"),
  awsSecretAccessKey: () => read("AWS_SECRET_ACCESS_KEY"),
  awsSessionToken: () => read("AWS_SESSION_TOKEN"),
  smtpHost: () => read("SMTP_HOST") || read("HOSTINGER_SMTP_HOST"),
  smtpPort: () => read("SMTP_PORT") || "587",
  smtpUser: () => read("SMTP_USER") || read("HOSTINGER_SMTP_USER"),
  smtpPass: () => read("SMTP_PASS") || read("HOSTINGER_SMTP_PASS"),
  mailFrom: () => read("MAIL_FROM") || "abijithasokan@crayonspictures.com",
  appUrl: () => resolveBridgeConfiguredOrigin(read("APP_URL"), read("SITE_URL")),
  databaseUrl: () => read("DATABASE_URL") || read("POSTGRES_URL"),
};

export function integrationStatus() {
  return {
    postgres: Boolean(bridgeEnv.databaseUrl()),
    supabase: Boolean(bridgeEnv.supabaseUrl() && (bridgeEnv.supabaseAnon() || bridgeEnv.supabaseService())),
    razorpay: Boolean(bridgeEnv.razorpayKeyId() && bridgeEnv.razorpayKeySecret()),
    razorpayWebhook: Boolean(bridgeEnv.razorpayWebhookSecret()),
    // OCI namespace is optional: the storage adapter resolves it through OCI when omitted.
    oci: Boolean(
      bridgeEnv.ociTenancyOcid() &&
        bridgeEnv.ociUserOcid() &&
        bridgeEnv.ociPrivateKey() &&
        bridgeEnv.ociRegion() &&
        bridgeEnv.ociBucket(),
    ),
    mail: Boolean(bridgeEnv.smtpHost() && bridgeEnv.smtpUser() && bridgeEnv.smtpPass()),
  };
}
