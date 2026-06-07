'use client';

import { useRef, useState } from 'react';
import { uploadLogo, saveLogo } from './actions';
import LanguageSelector from '../../components/LanguageSelector';

interface Props {
  initialLogoUrl: string | null;
  websiteUrl: string | null;
}

export default function GeneralSettingsClient({ initialLogoUrl, websiteUrl }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSaved(false);

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('File is too large — maximum size is 2 MB.');
      return;
    }

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadResult = await uploadLogo(formData);
      if ('error' in uploadResult) {
        setErrorMsg(uploadResult.error);
        setPreviewUrl(null);
        setUploading(false);
        return;
      }

      const saveResult = await saveLogo(uploadResult.url);
      if ('error' in saveResult) {
        setErrorMsg(saveResult.error);
        setPreviewUrl(null);
        setUploading(false);
        return;
      }

      setLogoUrl(uploadResult.url);
      setPreviewUrl(null);
      setSaved(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      // Reset the input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const displayUrl = previewUrl ?? logoUrl;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Brand Logo</h2>
        <p className="text-sm text-slate-500 mt-1">
          Your logo will appear on all generated images and videos.
        </p>
      </div>

      <div className="flex items-start gap-6">
        {/* Logo preview */}
        <div className="w-24 h-24 rounded-xl border-2 border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Brand logo"
              className="w-full h-full object-contain p-2"
            />
          ) : (
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          )}
        </div>

        {/* Upload controls */}
        <div className="flex-1 space-y-3">
          <label className="block">
            <span className="sr-only">Upload logo</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  Uploading…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  {logoUrl ? 'Replace logo' : 'Upload logo'}
                </>
              )}
            </button>
          </label>

          <p className="text-xs text-slate-400">
            PNG, JPG, GIF · Max 2 MB · Recommended: 400 × 400 px or larger
          </p>

          {errorMsg && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          {saved && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Logo saved successfully.
            </p>
          )}
        </div>
      </div>

      {websiteUrl && (
        <div className="pt-4 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">Website:</span>{' '}
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              {websiteUrl}
            </a>
          </p>
          <p className="text-xs text-slate-400 mt-1">To update your website URL, contact support.</p>
        </div>
      )}

      <div className="pt-4 border-t border-slate-100">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Language</h2>
        <p className="text-sm text-slate-500 mb-3">Choose the display language for the interface.</p>
        <LanguageSelector />
      </div>
    </div>
  );
}
