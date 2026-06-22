'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export type AttestationKind =
  | 'onboarding_master'
  | 'publish_high_stakes'
  | 'periodic_re_attestation'
  | 'industry_eligibility'
  | 'ip_ownership'
  | 'tos_acceptance'
  | 'ai_disclosure_consent';

export interface RecordAttestationInput {
  kind: AttestationKind;
  version?: string;
  signer_email?: string;
  context?: Record<string, unknown>;
  valid_until?: string;
}

export interface RecordedAttestation {
  id: string;
  signed_at: string;
  attestation_kind: AttestationKind;
  attestation_version: string;
}

export interface RequiredAttestations {
  missing: { kind: AttestationKind; reason: 'never_signed' | 'expired' }[];
  latest: Record<string, { signed_at: string; valid_until: string | null }>;
}

async function getToken(): Promise<string> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

export async function recordAttestation(input: RecordAttestationInput): Promise<RecordedAttestation> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/attestations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attestation_kind: input.kind,
      attestation_version: input.version ?? 'v1',
      signer_email: input.signer_email,
      context: input.context,
      valid_until: input.valid_until,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new Error(`Attestation failed: ${text}`);
  }
  return res.json();
}

export async function getRequiredAttestations(): Promise<RequiredAttestations> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/attestations/required`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch required attestations');
  }
  return res.json();
}
