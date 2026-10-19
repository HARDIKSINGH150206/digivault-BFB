import type { AuditHeadAnchor } from "@prisma/client";
import { prisma } from "./prisma";
import { putObjectLocked } from "./storage";
import { verifyAuditChain, type AuditChainResult } from "./audit-chain";
import { currentAuditHead, onChainSerialized } from "./anchor";
import {
  anchorAuditHeadOnChain,
  defaultChainConfig,
  getAuditHeadFromTx,
  getOnChainAuditHead,
  type ChainConfig,
} from "./polygon";

/**
 * Audit-log anchoring (docs/07 Phase 4, ADR-030).
 *
 * The audit log is hash-chained (lib/audit-chain.ts), so editing a row
 * breaks the chain — but someone with DB-owner access could rewrite every
 * row from the edit onward and recompute the hashes. Anchoring the head
 * (seq, entryHash) on EvidenceAnchorV2 stops that: a rewrite then no longer
 * matches the head on chain. Heads are anchored two ways:
 *   - carried by every document anchor (lib/anchor.ts, AnchorLog.auditSeq);
 *   - on their own, every AUDIT_ANCHOR_INTERVAL_HOURS (default 6), skipped
 *     when there is no entry newer than the head on chain.
 * Each standalone head is also written to the Object-Locked anchor bucket
 * (CLAUDE.md rule 3). Documented limit: entries after the last anchored
 * head can be rewritten undetected until the next anchor.
 *
 * Anchoring a head is NOT itself written to the audit log: that entry would
 * always be newer than the head just anchored, so there would never be a
 * run with nothing to anchor. AuditHeadAnchor rows are the record instead.
 */

export type AuditAnchorResult =
  | { status: "SKIPPED"; reason: string; onChainSeq: number | null }
  | { status: "ANCHORED"; record: AuditHeadAnchor }
  | { status: "FAILED"; record: AuditHeadAnchor | null; error: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function loadChainedRows() {
  return prisma.auditLog.findMany({ where: { seq: { not: null } }, orderBy: { seq: "asc" } });
}

function checkChain(rows: Awaited<ReturnType<typeof loadChainedRows>>): AuditChainResult {
  return verifyAuditChain(rows.map((r) => ({ ...r, seq: r.seq! })));
}

/**
 * Anchors the current audit head on its own if it is newer than the head on
 * chain. Refuses when the chain in the database doesn't verify, or when its
 * entry at the anchored seq differs from the head on chain (a rewrite that
 * recomputed the hashes): anchoring then would vouch for tampered entries.
 * Never throws.
 */
export async function anchorAuditHead(config: ChainConfig = defaultChainConfig()): Promise<AuditAnchorResult> {
  let record: AuditHeadAnchor | null = null;
  try {
    const rows = await loadChainedRows();
    const chain = checkChain(rows);
    if (!chain.ok) {
      throw new Error(`The audit chain does not verify at seq ${chain.badSeq} (${chain.reason}); not anchoring it.`);
    }

    return await onChainSerialized(async (): Promise<AuditAnchorResult> => {
      // Read both heads inside the queue, so a document anchor carrying a
      // head can't land between the check and this send.
      const head = await currentAuditHead();
      if (!head) return { status: "SKIPPED", reason: "The audit log has no chained entries yet.", onChainSeq: null };
      const onChain = await getOnChainAuditHead(config);
      if (onChain.seq > 0) {
        // Re-read: entries may have been added since the chain check, never changed.
        const atAnchor = rows.find((r) => r.seq === onChain.seq) ?? (await prisma.auditLog.findUnique({ where: { seq: onChain.seq } }));
        if (atAnchor?.entryHash !== onChain.head) {
          throw new Error(`Audit entry #${onChain.seq} does not match the head anchored on chain; the log was rewritten. Not anchoring it.`);
        }
      }
      if (head.seq <= onChain.seq) {
        return { status: "SKIPPED", reason: `No audit entries after seq ${onChain.seq}, which is already anchored.`, onChainSeq: onChain.seq };
      }

      const objectLockUri = await putObjectLocked(
        `audit-heads/seq-${head.seq}.json`,
        Buffer.from(
          JSON.stringify({ seq: head.seq, entry_hash: head.head, chain_id: config.chainId, contract_address: config.contractAddress })
        )
      );
      record = await prisma.auditHeadAnchor.create({
        data: { seq: head.seq, entryHash: head.head, objectLockUri, contractAddress: config.contractAddress },
      });
      const recordId = record.id;
      const { txHash, blockNumber } = await anchorAuditHeadOnChain(
        head,
        async (submitted) => {
          await prisma.auditHeadAnchor.update({ where: { id: recordId }, data: { submittedTxHash: submitted } });
        },
        config
      );
      record = await prisma.auditHeadAnchor.update({
        where: { id: recordId },
        data: { polygonTxHash: txHash, blockNumber, status: "ANCHORED" },
      });
      console.log(`[audit-anchor] anchored audit head seq ${head.seq} in block ${blockNumber} (tx ${txHash})`);
      return { status: "ANCHORED", record };
    });
  } catch (err) {
    const message = errorMessage(err);
    console.error("[audit-anchor] failed:", message);
    const failed = record as AuditHeadAnchor | null;
    if (failed) {
      record = await prisma.auditHeadAnchor
        .update({ where: { id: failed.id }, data: { status: "FAILED", errorMessage: message.slice(0, 1000) } })
        .catch(() => failed);
    }
    return { status: "FAILED", record, error: message };
  }
}

// --- Status (admin page, GET /api/v1/admin/audit) ---------------------------

export interface AnchoredHeadInfo {
  seq: number;
  head: string;
  anchoredAt: string | null;
  txHash: string | null;
  blockNumber: number | null;
}

export type AuditStatus = {
  chain: AuditChainResult;
  /** The head on chain, or null when there is none yet. */
  anchored: AnchoredHeadInfo | null;
  /** The database's entry at the anchored seq matches the head on chain. */
  anchoredMatches: boolean | null;
  /** Chained entries after the anchored head (rewritable until the next anchor). */
  unanchoredEntries: number | null;
  /**
   * When the anchored head doesn't match: the first rewritten entry is in
   * [from, to] (from the earlier anchored heads that still match).
   */
  rewrittenRange: { from: number; to: number } | null;
  chainReadError: string | null;
  intervalHours: number;
  recentAttempts: AuditHeadAnchor[];
};

/**
 * Pure part of the status check: does the database's chain agree with the
 * head anchored on chain? `entryHashAt` looks up a seq's entryHash in the
 * rows that were verified.
 */
export function compareWithAnchoredHead(
  chain: AuditChainResult,
  onChain: { seq: number; head: string } | null,
  entryHashAt: (seq: number) => string | null
): { anchoredMatches: boolean | null; unanchoredEntries: number | null } {
  if (!onChain || onChain.seq === 0) {
    return { anchoredMatches: null, unanchoredEntries: chain.ok ? chain.checked : null };
  }
  const anchoredMatches = entryHashAt(onChain.seq) === onChain.head;
  const unanchoredEntries = chain.ok && chain.headSeq !== null ? Math.max(0, chain.headSeq - onChain.seq) : null;
  return { anchoredMatches, unanchoredEntries };
}

/**
 * Narrows down where a rewrite starts: every head we recorded anchoring
 * (standalone and carried by document anchors), read back from its tx's
 * AuditHeadAnchored event, checked against the database in seq order.
 */
async function locateRewrite(
  upToSeq: number,
  entryHashAt: (seq: number) => string | null,
  config: ChainConfig
): Promise<{ from: number; to: number }> {
  const standalone = await prisma.auditHeadAnchor.findMany({
    where: { contractAddress: config.contractAddress, OR: [{ polygonTxHash: { not: null } }, { submittedTxHash: { not: null } }] },
  });
  const carried = await prisma.anchorLog.findMany({
    where: { contractAddress: config.contractAddress, auditSeq: { not: null }, polygonTxHash: { not: null } },
  });
  const txs = [...new Set([...standalone.map((a) => (a.polygonTxHash ?? a.submittedTxHash)!), ...carried.map((a) => a.polygonTxHash!)])];
  const heads: { seq: number; head: string }[] = [];
  for (const tx of txs) {
    const h = await getAuditHeadFromTx(tx, config).catch(() => null);
    if (h && h.seq < upToSeq) heads.push(h);
  }
  heads.sort((a, b) => a.seq - b.seq);
  let lastGood = 0;
  for (const h of heads) {
    if (entryHashAt(h.seq) !== h.head) return { from: lastGood + 1, to: h.seq };
    lastGood = h.seq;
  }
  return { from: lastGood + 1, to: upToSeq };
}

/** The tx that recorded `seq` on chain, from our own records of both anchor paths. */
async function txForSeq(seq: number, contractAddress: string): Promise<{ txHash: string; blockNumber: number | null } | null> {
  const standalone = await prisma.auditHeadAnchor.findFirst({
    where: { seq, contractAddress, OR: [{ polygonTxHash: { not: null } }, { submittedTxHash: { not: null } }] },
    orderBy: { createdAt: "desc" },
  });
  if (standalone) return { txHash: (standalone.polygonTxHash ?? standalone.submittedTxHash)!, blockNumber: standalone.blockNumber };
  const carried = await prisma.anchorLog.findFirst({
    where: { auditSeq: seq, contractAddress, status: "ANCHORED", polygonTxHash: { not: null } },
    orderBy: { anchoredAt: "desc" },
  });
  return carried ? { txHash: carried.polygonTxHash!, blockNumber: null } : null;
}

export async function getAuditStatus(config: ChainConfig = defaultChainConfig()): Promise<AuditStatus> {
  const rows = await loadChainedRows();
  const chain = checkChain(rows);
  const bySeq = new Map(rows.map((r) => [r.seq!, r.entryHash]));
  const recentAttempts = await prisma.auditHeadAnchor.findMany({ orderBy: { createdAt: "desc" }, take: 10 });

  let anchored: AnchoredHeadInfo | null = null;
  let chainReadError: string | null = null;
  try {
    const onChain = await getOnChainAuditHead(config);
    if (onChain.seq > 0) {
      anchored = { seq: onChain.seq, head: onChain.head, anchoredAt: new Date(onChain.timestamp * 1000).toISOString(), txHash: null, blockNumber: null };
      const tx = await txForSeq(onChain.seq, config.contractAddress);
      if (tx) {
        anchored.txHash = tx.txHash;
        anchored.blockNumber = tx.blockNumber ?? (await getAuditHeadFromTx(tx.txHash, config).catch(() => null))?.blockNumber ?? null;
      }
    }
  } catch (err) {
    chainReadError = errorMessage(err);
  }

  const entryHashAt = (seq: number) => bySeq.get(seq) ?? null;
  const comparison = compareWithAnchoredHead(chain, anchored, entryHashAt);
  const rewrittenRange =
    anchored && comparison.anchoredMatches === false ? await locateRewrite(anchored.seq, entryHashAt, config).catch(() => null) : null;

  return {
    chain,
    anchored,
    ...comparison,
    rewrittenRange,
    chainReadError,
    intervalHours: auditAnchorIntervalHours(),
    recentAttempts,
  };
}

// --- Schedule ---------------------------------------------------------------

/** AUDIT_ANCHOR_INTERVAL_HOURS: default 6; 0 turns the schedule off. */
export function auditAnchorIntervalHours(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AUDIT_ANCHOR_INTERVAL_HOURS;
  const hours = raw === undefined || raw.trim() === "" ? 6 : Number(raw);
  if (!Number.isFinite(hours) || hours < 0) throw new Error(`AUDIT_ANCHOR_INTERVAL_HOURS must be a number >= 0, got "${raw}".`);
  return hours;
}

const globalForSchedule = globalThis as unknown as { __digivaultAuditAnchorTimer?: ReturnType<typeof setInterval> };

/**
 * Starts the standalone audit-head anchor (src/instrumentation.ts). Single
 * long-running Node server only, like background document anchoring; the
 * first run is one interval after startup. Started once per process.
 */
export function startAuditAnchorSchedule(): void {
  if (globalForSchedule.__digivaultAuditAnchorTimer) return;
  let hours: number;
  try {
    hours = auditAnchorIntervalHours();
  } catch (err) {
    console.error("[audit-anchor]", errorMessage(err), "- schedule not started");
    return;
  }
  if (hours === 0) {
    console.log("[audit-anchor] AUDIT_ANCHOR_INTERVAL_HOURS=0: scheduled audit-head anchoring is off");
    return;
  }
  const timer = setInterval(() => {
    void anchorAuditHead().then((r) => {
      if (r.status === "SKIPPED") console.log(`[audit-anchor] skipped: ${r.reason}`);
    });
  }, hours * 3_600_000);
  timer.unref?.();
  globalForSchedule.__digivaultAuditAnchorTimer = timer;
  console.log(`[audit-anchor] anchoring the audit head every ${hours} h (skipped when nothing is new)`);
}
