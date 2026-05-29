'use client';

import { useState, useTransition } from 'react';
import { recordAttestation, type AttestationKind } from './attestation-actions';

// Statements shown to the user. Kept identical to the server-side statements in
// apps/api/src/routes/attestations.ts. The server is the source of truth for
// what gets persisted; this client copy is for display only.
const STATEMENTS: Record<AttestationKind, string> = {
  onboarding_master:
    'I confirm that all information, claims, prices, media, and business representations I provide to Vigmis are accurate, lawful, and either owned by me or used with proper authorization. I understand that Vigmis is an advertising-automation tool and is not the source of business truth — I am solely responsible for the accuracy of what I submit.',
  publish_high_stakes:
    'I have reviewed this content and confirm that all claims, prices, promises, guarantees, and media used are accurate, lawful, and authorized for use. I take full responsibility for publishing this content.',
  periodic_re_attestation:
    'I confirm that the business information, pricing, inventory, licenses, and product representations stored in Vigmis remain accurate as of today. I will update any that have changed.',
  industry_eligibility:
    'I confirm that I hold the professional license(s) required to advertise services in my industry, and the license is valid in every jurisdiction where my ads will run.',
  ip_ownership:
    'I confirm that I own — or have explicit written permission to use — every image, video, logo, brand mark, music track, and piece of copy submitted to Vigmis.',
  tos_acceptance:
    'I have read and agree to Vigmis\'s Terms of Service and Acceptable Use Policy. I understand Vigmis reserves the right to refuse or terminate service at its sole discretion.',
  ai_disclosure_consent:
    'I authorize Vigmis to label AI-generated content with platform-required disclosures (Meta, Google, TikTok AI-content labels, EU AI Act notices).',
};

interface Props {
  kind: AttestationKind;
  version?: string;
  context?: Record<string, unknown>;
  validUntil?: string;
  signerEmail?: string;
  onSigned?: (result: { id: string; signed_at: string }) => void;
  onError?: (message: string) => void;
  required?: boolean;
  className?: string;
}

export default function AttestationCheckbox({
  kind,
  version = 'v1',
  context,
  validUntil,
  signerEmail,
  onSigned,
  onError,
  required = true,
  className = '',
}: Props) {
  const [checked, setChecked] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const statement = STATEMENTS[kind];

  function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    if (signed || isPending) return;
    const nextChecked = e.target.checked;
    setChecked(nextChecked);
    setError(null);
    if (!nextChecked) return;

    startTransition(async () => {
      try {
        const result = await recordAttestation({
          kind,
          version,
          context,
          valid_until: validUntil,
          signer_email: signerEmail,
        });
        setSigned(true);
        onSigned?.({ id: result.id, signed_at: result.signed_at });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not record your acknowledgment. Please try again.';
        setError(msg);
        setChecked(false);
        onError?.(msg);
      }
    });
  }

  return (
    <label
      className={`flex items-start gap-3 p-4 rounded-lg border ${
        signed
          ? 'border-emerald-300 bg-emerald-50'
          : error
          ? 'border-rose-300 bg-rose-50'
          : 'border-slate-300 bg-white hover:border-slate-400'
      } cursor-pointer transition-colors ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={handleToggle}
        disabled={signed || isPending}
        required={required}
        className="mt-1 h-5 w-5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
        aria-describedby={`attestation-${kind}-text`}
      />
      <div className="flex-1 min-w-0">
        <p id={`attestation-${kind}-text`} className="text-sm text-slate-700 leading-relaxed">
          <bdi>{statement}</bdi>
        </p>
        {isPending && (
          <p className="text-xs text-slate-500 mt-2">Recording your acknowledgment…</p>
        )}
        {signed && (
          <p className="text-xs text-emerald-700 mt-2 font-medium">
            ✓ Acknowledged and recorded.
          </p>
        )}
        {error && (
          <p className="text-xs text-rose-700 mt-2">{error}</p>
        )}
      </div>
    </label>
  );
}
