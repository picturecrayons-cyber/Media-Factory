import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bridgeEnv } from "./env.ts";

function config() {
  const region = bridgeEnv.awsRegion();
  const bucket = bridgeEnv.awsBucket();
  if (!region || !bucket) throw new Error("AWS S3 region and media bucket are required");
  const accessKeyId = bridgeEnv.awsAccessKeyId();
  const secretAccessKey = bridgeEnv.awsSecretAccessKey();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey))
    throw new Error("Incomplete AWS credentials");
  const client = new S3Client({
    region,
    // Omit explicit credentials for SDK workload-role credentials.
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
            sessionToken: bridgeEnv.awsSessionToken(),
          },
        }
      : {}),
  });
  return { client, bucket };
}

export function assertObjectKey(key: string) {
  if (
    !key ||
    Buffer.byteLength(key) > 1024 ||
    key.startsWith("/") ||
    Array.from(key).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    key.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("Invalid S3 object key");
  }
  return key;
}

function expiry(value: number | undefined, fallback: number) {
  const seconds = value ?? fallback;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 900)
    throw new Error("Invalid signed URL expiry");
  return seconds;
}

export async function signUpload(opts: { key: string; contentType: string; expiresIn?: number }) {
  const key = assertObjectKey(opts.key);
  const { client, bucket } = config();
  try {
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: opts.contentType }),
      {
        expiresIn: expiry(opts.expiresIn, 900),
        signableHeaders: new Set(["content-type"]),
      },
    );
    return { url, key, bucket, method: "PUT" as const };
  } finally {
    client.destroy();
  }
}

export async function signDownload(opts: { key: string; expiresIn?: number }) {
  const key = assertObjectKey(opts.key);
  const { client, bucket } = config();
  try {
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiry(opts.expiresIn, 300),
    });
    return { url, key, bucket, method: "GET" as const };
  } finally {
    client.destroy();
  }
}

export async function verifyObject(key: string) {
  assertObjectKey(key);
  const { client, bucket } = config();
  try {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const byteSize = object.ContentLength ?? 0;
    if (!Number.isSafeInteger(byteSize) || byteSize <= 0)
      throw new Error("Uploaded object is empty");
    return {
      byteSize,
      contentType: object.ContentType ?? null,
      etag: object.ETag?.replaceAll('"', "") ?? null,
    };
  } finally {
    client.destroy();
  }
}

/** Seal only the exact inspected source. Originals and legacy films/... keys remain untouched. */
export async function sealVerifiedObject(
  sourceKey: string,
  destinationKey: string,
  expectedEtag: string,
) {
  assertObjectKey(sourceKey);
  assertObjectKey(destinationKey);
  if (sourceKey === destinationKey || !expectedEtag || /[\r\n"]/.test(expectedEtag))
    throw new Error("Invalid sealing request");
  const { client, bucket } = config();
  try {
    const source = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: sourceKey, IfMatch: `"${expectedEtag}"` }),
    );
    if (!source.ContentLength || source.ContentLength > 5 * 1024 ** 3)
      throw new Error(
        "Large masters require multipart upload and sealing; single-part confirmation is unavailable",
      );
    const copied = await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: destinationKey,
        CopySource: `${encodeURIComponent(bucket)}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
        CopySourceIfMatch: `"${expectedEtag}"`,
      }),
    );
    const destination = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: destinationKey }),
    );
    if (
      !copied.CopyObjectResult?.ETag ||
      destination.ETag !== copied.CopyObjectResult.ETag ||
      destination.ContentLength !== source.ContentLength
    )
      throw new Error("Sealed object verification failed");
    return {
      byteSize: destination.ContentLength,
      contentType: destination.ContentType ?? null,
      etag: destination.ETag.replaceAll('"', ""),
    };
  } finally {
    client.destroy();
  }
}

export function titleAssetKey(opts: {
  ownerUserId: string;
  titleId: string;
  kind: string;
  filename: string;
}) {
  const safe = opts.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return assertObjectKey(
    `bridge/${opts.ownerUserId}/${opts.titleId}/${opts.kind}/${randomUUID()}-${safe}`,
  );
}
