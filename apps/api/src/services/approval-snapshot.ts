// Approval Snapshot Service
//
// Whenever the customer approves something that will be published — a post, an
// ad creative, a budget change, an OAuth disconnect — we capture a forensic
// record: the exact bytes approved, who approved, when, from where, hash of it.
//
// "I didn't approve that" → here is the SHA-256, your IP, your user agent,
// your Clerk user id, the timestamp, and the JSON snapshot of the content.

import crypto from 'crypto';
import { db } from '@vigmis/db';
import type { FastifyRequest } from 'fastify';

export type SubjectKind =
  | 'social_post'
  | 'ad_creative'
  | 'campaign'
  | 'budget_change'
  | 'strategy'
  | 'onboarding'
  | 'disconnect'
  | 'other';

export type ApprovalMethod =
  | 'web_click'
  | 'chat_command'
  | 'email_link'
  | 'auto_mode'
  | 'api';

export interface CaptureSnapshotArgs {
  tenantId: string;
  clerkUserId: string;
  approverEmail?: string | null;
  subjectKind: SubjectKind;
  subjectId?: string | null;
  contentSnapshot: unknown;          // any JSON-serializable object
  approvalMethod: ApprovalMethod;
  clientIp?: string | null;
  userAgent?: string | null;
  deviceFingerprint?: string | null;
  relatedDecisionId?: string | null;
  attestationId?: string | null;
}

export interface CapturedSnapshot {
  id: string;
  content_hash: string;
  created_at: string;
}

/**
 * Canonical-JSON SHA-256.
 * Object keys are sorted recursively so the same content always hashes to the
 * same value regardless of insertion order. This is what makes "did this
 * exact content get approved?" verifiable later.
 */
export function canonicalHash(value: unknown): string {
  const canonical = stableStringify(value);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/**
 * Persist an approval snapshot. Returns the id + hash + timestamp.
 * Throws on DB error — the caller decides whether failure to record blocks the action.
 * For high-stakes actions (publish, budget change) the caller MUST block on failure.
 */
export async function captureApprovalSnapshot(args: CaptureSnapshotArgs): Promise<CapturedSnapshot> {
  const contentHash = canonicalHash(args.contentSnapshot);

  const { data, error } = await db
    .from('approval_snapshots')
    .insert({
      tenant_id: args.tenantId,
      subject_kind: args.subjectKind,
      subject_id: args.subjectId ?? null,
      content_snapshot: args.contentSnapshot,
      content_hash: contentHash,
      approver_clerk_user_id: args.clerkUserId,
      approver_email: args.approverEmail ?? null,
      approval_method: args.approvalMethod,
      client_ip: args.clientIp ?? null,
      user_agent: args.userAgent ?? null,
      device_fingerprint: args.deviceFingerprint ?? null,
      related_decision_id: args.relatedDecisionId ?? null,
      attestation_id: args.attestationId ?? null,
    })
    .select('id, content_hash, created_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to capture approval snapshot: ${error?.message ?? 'unknown'}`);
  }

  return data as CapturedSnapshot;
}

/**
 * Convenience wrapper that pulls forensic context off a Fastify request.
 * Use this from any route that performs an approval action.
 */
export function snapshotArgsFromRequest(
  request: FastifyRequest,
  rest: Omit<CaptureSnapshotArgs, 'tenantId' | 'clerkUserId' | 'clientIp' | 'userAgent'>,
): CaptureSnapshotArgs {
  return {
    tenantId: request.tenantId,
    clerkUserId: request.clerkUserId,
    clientIp: request.ip ?? null,
    userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
    ...rest,
  };
}
