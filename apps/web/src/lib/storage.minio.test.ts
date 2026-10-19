import { describe, expect, it } from "vitest";
import { putPublicProof } from "./storage";

// Integration test against the local MinIO from docker-compose. Skipped
// unless MINIO_INTEGRATION=1. Writes one Object-Locked test object.
describe.skipIf(process.env.MINIO_INTEGRATION !== "1")("public proof bucket (local MinIO)", () => {
  it("serves proofs anonymously, with CORS, but refuses listing", async () => {
    const id = `test-${Date.now().toString(36)}`;
    const url = await putPublicProof(id, { digivault_proof_version: 2, public: true, document_version_id: id });

    const res = await fetch(url, { headers: { Origin: "http://192.168.1.20:3000" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ document_version_id: id });
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();

    const bucketRoot = new URL(url);
    bucketRoot.pathname = bucketRoot.pathname.replace(/\/proofs\/[^/]+$/, "/");
    const listing = await fetch(bucketRoot);
    expect(listing.status).toBe(403);
  });
});
