import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bridgeEnv } from "./env";

function client() {
  const region = bridgeEnv.awsRegion();
  const access = bridgeEnv.awsAccessKey();
  const secret = bridgeEnv.awsSecretKey();
  const bucket = bridgeEnv.s3Bucket();
  if (!region || !bucket || Boolean(access) !== Boolean(secret)) {
    throw new Error("Private S3 is not configured");
  }
  return {
    bucket,
    s3: new S3Client({
      region,
      // Prefer the SDK's temporary credential chain (such as an IAM role).
      // Existing server-only key pairs remain supported during rotation.
      ...(access && secret ? { credentials: { accessKeyId: access, secretAccessKey: secret } } : {}),
    }),
  };
}

export async function signUpload(opts: { key: string; contentType: string; expiresIn?: number }) {
  const { s3, bucket } = client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    ContentType: opts.contentType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: opts.expiresIn ?? 900 });
  return { url, key: opts.key, bucket, method: "PUT" as const };
}

export async function signDownload(opts: { key: string; expiresIn?: number }) {
  const { s3, bucket } = client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: opts.key });
  const url = await getSignedUrl(s3, command, { expiresIn: opts.expiresIn ?? 300 });
  return { url, key: opts.key, bucket, method: "GET" as const };
}

export async function verifyObject(key: string) {
  const { s3, bucket } = client();
  const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.ContentLength || result.ContentLength <= 0) throw new Error("Uploaded object is empty");
  return { byteSize: result.ContentLength, contentType: result.ContentType ?? null };
}

export function titleAssetKey(opts: { ownerUserId: string; titleId: string; kind: string; filename: string }) {
  const safe = opts.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return `bridge/${opts.ownerUserId}/${opts.titleId}/${opts.kind}/${Date.now()}-${safe}`;
}
