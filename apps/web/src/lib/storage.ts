import { Client, type ObjectLockInfo } from "minio";

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY ?? "digivault",
  secretKey: process.env.MINIO_SECRET_KEY ?? "digivault123",
});

const BUCKET = process.env.MINIO_BUCKET ?? "digivault-evidence";

let bucketEnsured = false;
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const exists = await minioClient.bucketExists(BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
  }
  bucketEnsured = true;
}

export async function putPagePng(objectKey: string, bytes: Buffer): Promise<string> {
  await ensureBucket();
  await minioClient.putObject(BUCKET, objectKey, bytes, bytes.byteLength, {
    "Content-Type": "image/png",
  });
  return `s3://${BUCKET}/${objectKey}`;
}

export async function getPagePng(objectKey: string): Promise<Buffer> {
  const stream = await minioClient.getObject(BUCKET, objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Page indices stored under a version prefix (`<documentId>/v<n>/`), from
 * the `page-<i>.png` object names, ascending.
 */
export async function listPageIndices(versionPrefix: string): Promise<number[]> {
  await ensureBucket();
  const prefix = versionPrefix.endsWith("/") ? versionPrefix : `${versionPrefix}/`;
  const indices: number[] = [];
  const stream = minioClient.listObjectsV2(BUCKET, `${prefix}page-`, false);
  for await (const obj of stream as AsyncIterable<{ name?: string }>) {
    const match = obj.name?.slice(prefix.length).match(/^page-(\d+)\.png$/);
    if (match) indices.push(Number(match[1]));
  }
  return indices.sort((a, b) => a - b);
}

/**
 * Anchor records live in their own bucket because S3/MinIO Object Lock can
 * only be enabled when a bucket is created, and the evidence bucket above
 * predates it. Compliance mode: nobody, including the MinIO root user, can
 * delete or overwrite a locked object version before its retention ends.
 * Retention defaults to 30 days for development; production must set
 * MINIO_ANCHOR_RETENTION_DAYS to at least the case-file retention period.
 */
const ANCHOR_BUCKET = process.env.MINIO_ANCHOR_BUCKET ?? "digivault-anchors";
const ANCHOR_RETENTION_DAYS = Number(process.env.MINIO_ANCHOR_RETENTION_DAYS || 30);

let anchorBucketEnsured = false;
async function ensureAnchorBucket(): Promise<void> {
  if (anchorBucketEnsured) return;
  const exists = await minioClient.bucketExists(ANCHOR_BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(ANCHOR_BUCKET, "us-east-1", { ObjectLocking: true });
  }
  const lock = await (minioClient.getObjectLockConfig(ANCHOR_BUCKET) as unknown as Promise<ObjectLockInfo>).catch(() => null);
  if (!lock || !("objectLockEnabled" in lock) || lock.objectLockEnabled !== "Enabled") {
    throw new Error(
      `MinIO bucket "${ANCHOR_BUCKET}" does not have Object Lock enabled. It must be created with object ` +
        "locking (delete it if it is empty and let the app recreate it, or set MINIO_ANCHOR_BUCKET to a new name)."
    );
  }
  if (!lock.mode) {
    await minioClient.setObjectLockConfig(ANCHOR_BUCKET, {
      mode: "COMPLIANCE",
      unit: "Days",
      validity: ANCHOR_RETENTION_DAYS,
    } as Parameters<typeof minioClient.setObjectLockConfig>[1]);
  }
  anchorBucketEnsured = true;
}

/**
 * Writes the anchored merkle_root under Object Lock (Compliance mode) —
 * the off-chain half of the dual anchor (CLAUDE.md rule 3). Reads the
 * retention back and throws unless the stored version really is locked,
 * so an unlocked write can never be reported as an anchor.
 */
export async function putObjectLocked(objectKey: string, body: Buffer): Promise<string> {
  await ensureAnchorBucket();
  const { versionId } = await minioClient.putObject(ANCHOR_BUCKET, objectKey, body, body.byteLength, {
    "Content-Type": "application/json",
  });
  const retention = await minioClient.getObjectRetention(ANCHOR_BUCKET, objectKey, versionId ? { versionId } : undefined);
  if (retention?.mode !== "COMPLIANCE") {
    throw new Error(`Object Lock not applied to ${ANCHOR_BUCKET}/${objectKey} (retention: ${JSON.stringify(retention)}).`);
  }
  return `s3://${ANCHOR_BUCKET}/${objectKey}${versionId ? `?versionId=${versionId}` : ""}`;
}
