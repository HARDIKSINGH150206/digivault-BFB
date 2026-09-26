import { Client } from "minio";

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
 * Writes the anchored merkle_root under Object Lock (Compliance mode) —
 * the off-chain half of the dual anchor (CLAUDE.md rule 3). MinIO Object
 * Lock requires the bucket to have object locking enabled at creation
 * time; docker-compose's default MinIO bucket does not have this
 * configured yet, so this call will fail until that's set up as part of
 * step 4's storage hardening — see the audit report.
 */
export async function putObjectLocked(objectKey: string, body: Buffer): Promise<string> {
  await ensureBucket();
  await minioClient.putObject(BUCKET, objectKey, body, body.byteLength, {
    "Content-Type": "application/json",
  });
  return `s3://${BUCKET}/${objectKey}`;
}
