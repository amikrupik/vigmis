'use client';

import { useState, useTransition } from 'react';
import { saveBrandSettings } from './actions';

const DO_NOT_CHANGE_OPTIONS = [
  { value: 'logo', label: 'Logo' },
  { value: 'product', label: 'Product' },
  { value: 'face', label: 'Face / Person' },
  { value: 'colors', label: 'Colors' },
  { value: 'background', label: 'Background' },
  { value: 'text', label: 'Text / CTA' },
  { value: 'layout', label: 'Layout' },
];

interface Props {
  initialColors: string[];
  initialFonts: string[];
  initialDoNotChange: string[];
}

export default function BrandSettingsClient({ initialColors, initialFonts, initialDoNotChange }: Props) {
  const [colors, setColors] = useState<string[]>(
    initialColors.length > 0 ? initialColors : [''],
  );
  const [fonts, setFonts] = useState<string[]>(
    initialFonts.length > 0 ? initialFonts : [''],
  );
  const [doNotChange, setDoNotChange] = useState<string[]>(initialDoNotChange);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateColor(index: number, value: string) {
    setColors(prev => prev.map((c, i) => (i === index ? value : c)));
    setSaved(false);
  }

  function addColor() {
    if (colors.length >= 5) return;
    setColors(prev => [...prev, '#000000']);
    setSaved(false);
  }

  function removeColor(index: number) {
    setColors(prev => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function updateFont(index: number, value: string) {
    setFonts(prev => prev.map((f, i) => (i === index ? value : f)));
    setSaved(false);
  }

  function addFont() {
    if (fonts.length >= 3) return;
    setFonts(prev => [...prev, '']);
    setSaved(false);
  }

  function removeFont(index: number) {
    setFonts(prev => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function toggleDoNotChange(value: string) {
    setDoNotChange(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value],
    );
    setSaved(false);
  }

  function handleSave() {
    setErrorMsg(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBrandSettings({
        brand_colors: colors.filter(c => c.trim().length > 0),
        brand_fonts: fonts.filter(f => f.trim().length > 0),
        do_not_change_elements: doNotChange,
      });
      if ('error' in result) {
        setErrorMsg(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <div className="space-y-8">

      {/* Brand Colors */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Brand Colors</h2>
          <p className="text-sm text-slate-500 mt-1">
            These colors will be included in every AI creative prompt to maintain brand consistency.
          </p>
        </div>

        <div className="space-y-3">
          {colors.map((color, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg border border-slate-200 flex-shrink-0 overflow-hidden"
                style={{ backgroundColor: color || '#e2e8f0' }}
              >
                <input
                  type="color"
                  value={color || '#000000'}
                  onChange={e => updateColor(i, e.target.value)}
                  className="w-full h-full opacity-0 cursor-pointer"
                  title="Pick color"
                />
              </div>
              <input
                type="text"
                value={color}
                onChange={e => updateColor(i, e.target.value)}
                placeholder="#FF5500"
                maxLength={9}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {colors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeColor(i)}
                  className="text-slate-400 hover:text-red-500 transition-colors p-1"
                  title="Remove color"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {colors.length < 5 && (
          <button
            type="button"
            onClick={addColor}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add color
          </button>
        )}
      </div>

      {/* Brand Fonts */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Brand Fonts</h2>
          <p className="text-sm text-slate-500 mt-1">
            Font names included in creative prompts (e.g. &quot;Montserrat&quot;, &quot;Open Sans&quot;).
          </p>
        </div>

        <div className="space-y-3">
          {fonts.map((font, i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="text"
                value={font}
                onChange={e => updateFont(i, e.target.value)}
                placeholder="e.g. Montserrat"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {fonts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeFont(i)}
                  className="text-slate-400 hover:text-red-500 transition-colors p-1"
                  title="Remove font"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {fonts.length < 3 && (
          <button
            type="button"
            onClick={addFont}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add font
          </button>
        )}
      </div>

      {/* Do Not Change Elements */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Do Not Change These Elements</h2>
          <p className="text-sm text-slate-500 mt-1">
            Selected elements will be locked in every AI creative generation. The AI will never modify them.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {DO_NOT_CHANGE_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={doNotChange.includes(opt.value)}
                onChange={() => toggleDoNotChange(opt.value)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 group-hover:text-slate-900">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Save */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}
      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 font-medium">
          Brand DNA saved successfully.
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        {isPending ? 'Saving...' : 'Save Brand DNA'}
      </button>

    </div>
  );
}
