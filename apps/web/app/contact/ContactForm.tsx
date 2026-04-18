'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const CATEGORIES = [
  { value: 'general', label: 'General inquiry' },
  { value: 'billing', label: 'Billing & payments' },
  { value: 'bug', label: 'Bug report' },
  { value: 'partnership', label: 'Partnership / Agency' },
  { value: 'legal', label: 'Legal' },
];

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', category: 'general', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch(`${API_URL}/account/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setStatus(res.ok ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">✓</div>
        <h3 className="font-bold text-slate-900 mb-2">Message sent!</h3>
        <p className="text-slate-500 text-sm">We'll reply to <strong>{form.email}</strong> within 1–2 business days. Check your inbox for a confirmation email.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Your name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Jane Smith"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email address *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="jane@company.com"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Category</label>
        <select
          value={form.category}
          onChange={e => set('category', e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Subject</label>
        <input
          type="text"
          value={form.subject}
          onChange={e => set('subject', e.target.value)}
          placeholder="Brief description"
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Message *</label>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={e => set('message', e.target.value)}
          placeholder="Describe your issue or question in detail..."
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      {status === 'error' && (
        <p className="text-red-600 text-sm">Something went wrong. Please try again or email hello@vigmis.com directly.</p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
      >
        {status === 'sending' ? 'Sending...' : 'Send message →'}
      </button>

      <p className="text-xs text-slate-400 text-center">We'll send you a confirmation email and reply within 1–2 business days.</p>
    </form>
  );
}
