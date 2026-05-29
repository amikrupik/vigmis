'use client';

import { useEffect, useState, useTransition } from 'react';
import { recordAttestation, getRequiredAttestations, type AttestationKind } from '../../components/attestation-actions';

const LICENSE_OPTIONS: { value: string; label: string }[] = [
  { value: 'medical_license', label: 'Medical license' },
  { value: 'financial_advisor_license', label: 'Financial advisor license' },
  { value: 'bar_admission', label: 'Bar admission (legal)' },
  { value: 'gambling_license', label: 'Gambling license' },
  { value: 'alcohol_license', label: 'Alcohol license' },
  { value: 'cannabis_license', label: 'Cannabis license' },
  { value: 'medical_aesthetic_license', label: 'Medical aesthetic procedures license' },
  { value: 'health_claim_substantiation', label: 'Health claim substantiation evidence' },
  { value: 'minor_targeting_review', label: 'Minor-targeting compliance review' },
];

export default function ComplianceClient() {
  const [required, setRequired] = useState<{ missing: { kind: AttestationKind; reason: string }[]; latest: Record<string, { signed_at: string; valid_until: string | null }> } | null>(null);
  const [licenseType, setLicenseType] = useState(LICENSE_OPTIONS[0].value);
  const [licenseNo, setLicenseNo] = useState('');
  const [jurisdiction, setJurisdiction] = useState('IL');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setRequired(await getRequiredAttestations().catch(() => null));
  }
  useEffect(() => { load(); }, []);

  function submitLicense() {
    startTransition(async () => {
      try {
        await recordAttestation({
          kind: 'industry_eligibility',
          context: { license: licenseType, license_no: licenseNo.trim(), jurisdiction },
        });
        setMessage(`License attested: ${licenseType}`);
        setLicenseNo('');
        await load();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to attest');
      }
    });
  }

  function reAttestMaster() {
    startTransition(async () => {
      try {
        await recordAttestation({ kind: 'onboarding_master' });
        setMessage('Master attestation refreshed.');
        await load();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="space-y-6">
      {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2 rounded-xl">{message}</div>}

      {/* Required attestations status */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Required attestations</h2>
        {required?.missing && required.missing.length > 0 ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-lg">
            Missing: {required.missing.map((m) => m.kind).join(', ')}
          </div>
        ) : (
          <p className="text-xs text-emerald-700">✓ All required attestations on file.</p>
        )}
        <div className="space-y-1.5 text-xs text-slate-600">
          {Object.entries(required?.latest ?? {}).map(([kind, info]) => (
            <div key={kind} className="flex justify-between border-b border-slate-100 py-1.5">
              <span className="font-medium">{kind}</span>
              <span className="text-slate-400">{new Date(info.signed_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
        <button
          onClick={reAttestMaster}
          disabled={pending}
          className="text-xs border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg"
        >
          Re-confirm master attestation
        </button>
      </section>

      {/* Industry license attest */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Industry license</h2>
        <p className="text-xs text-slate-500">For regulated industries (medical, financial, gambling, etc.), Vigmis requires a license attestation before publishing ads. Vigmis does not store license documents — only your attestation that you hold the license.</p>
        <select value={licenseType} onChange={(e) => setLicenseType(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
          {LICENSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} placeholder="License number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="Jurisdiction (ISO-2: IL, US, GB, ...)" maxLength={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase" />
        <button
          onClick={submitLicense}
          disabled={pending || !licenseNo.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          Submit license attestation
        </button>
      </section>

      <section className="bg-slate-100 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 leading-relaxed">
        <strong>Note:</strong> By submitting a license attestation you confirm — under the terms in the Terms of Service — that the license is valid in every jurisdiction where ads will run. False attestation may result in service termination without refund.
      </section>
    </div>
  );
}
