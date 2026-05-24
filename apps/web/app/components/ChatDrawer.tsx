'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { sendChatMessage, getChatHistory, type ExecutedAction } from './chat-actions';

type Message = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  executedActions?: ExecutedAction[];
};

function ActionBadge({ action }: { action: ExecutedAction }) {
  const successLabel: Record<string, string> = {
    pause_campaign:  'Paused campaign',
    resume_campaign: 'Resumed campaign',
    update_budget:   'Budget updated',
    pause_all:       'All campaigns paused',
    resume_all:      'All campaigns resumed',
    create_post:     'AI post created',
    write_post:      'Custom post saved',
    edit_post:       'Post updated',
    set_post_image:  'Image attached',
    approve_post:    'Post approved',
    reject_post:     'Post rejected',
    schedule_post:    'Post rescheduled',
    select_ad_account: 'Ad account set',
  };
  const failLabel: Record<string, string> = {
    pause_campaign:  'Failed to pause campaign',
    resume_campaign: 'Failed to resume campaign',
    update_budget:   'Budget update failed',
    pause_all:       'Failed to pause all campaigns',
    resume_all:      'Failed to resume all campaigns',
    create_post:     'Failed to create post',
    write_post:      'Failed to save post',
    edit_post:       'Failed to update post',
    set_post_image:  'Failed to attach image',
    approve_post:    'Failed to approve',
    reject_post:     'Failed to reject',
    schedule_post:    'Failed to reschedule',
    select_ad_account: 'Failed to set ad account',
  };

  return (
    <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${action.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {action.success
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
      </svg>
      <span className="font-medium">{action.success ? (successLabel[action.type] ?? action.type) : (failLabel[action.type] ?? `Failed: ${action.type}`)}</span>
      {action.campaign_name && <span className="opacity-70">— {action.campaign_name}</span>}
      {action.detail && <span className="opacity-70">({action.detail})</span>}
    </div>
  );
}

function pageContextFor(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  if (pathname.startsWith('/onboarding')) return 'User is in the Onboarding flow.';
  if (pathname.startsWith('/dashboard')) return 'User is on the Dashboard (campaigns, analytics, social, comments).';
  if (pathname.startsWith('/billing')) return 'User is on the Billing page.';
  if (pathname.startsWith('/profile')) return 'User is on the Profile page.';
  if (pathname.startsWith('/demo')) return 'User is on the public Demo page (no real account yet).';
  return `User is on ${pathname}.`;
}

export default function ChatDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !historyLoaded) {
      getChatHistory()
        .then(h => {
          setMessages(h.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })));
          setHistoryLoaded(true);
        })
        .catch(() => setHistoryLoaded(true));
    }
    if (!open) setHistoryLoaded(false);
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  function handleSend() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    startTransition(async () => {
      try {
        const res = await sendChatMessage(text, pageContextFor(pathname));
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.message,
          executedActions: res.executedActions?.length ? res.executedActions : undefined,
        }]);
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: '__error__' }]);
      }
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-colors"
        aria-label="Ask VIGMIS"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
      )}

      <div className={`fixed bottom-0 right-0 z-50 w-full max-w-md h-[75vh] bg-white shadow-2xl rounded-t-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <span className="font-bold text-slate-900">Ask VIGMIS</span>
            <span className="ml-2 text-xs text-slate-400 font-medium">AI Marketing Manager</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {!historyLoaded && open && (
            <div className="flex justify-center py-8">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                Loading history…
              </div>
            </div>
          )}
          {historyLoaded && messages.length === 0 && !isPending && (
            <div className="py-8 space-y-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-700">Ask me anything</p>
                <p className="text-xs text-slate-400 max-w-[260px] mx-auto">Campaigns, budgets, posts — I can answer and act. Try: "Write a Facebook post about our spring sale" or "Pause all campaigns".</p>
              </div>
              <div className="space-y-2">
                {[
                  'How are my campaigns performing?',
                  'Create a promotional Instagram post',
                  'Write a Facebook post: Spring sale, 20% off all dates this week',
                  'Pause all campaigns',
                ].map(q => (
                  <button key={q} onClick={() => { setInput(q); }} className="w-full text-left text-xs px-3 py-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id ?? i} className="space-y-1.5">
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.content === '__error__' ? (
                  <div className="bg-red-50 border border-red-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-red-700 flex items-center gap-3">
                    <span>Connection error</span>
                    <button onClick={handleSend} className="text-xs font-semibold text-red-600 underline">Retry</button>
                  </div>
                ) : (
                <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
                )}
              </div>
              {msg.content !== '__error__' && msg.executedActions?.map((action, j) => (
                <div key={j} className="flex justify-start pl-1">
                  <ActionBadge action={action} />
                </div>
              ))}
            </div>
          ))}

          {isPending && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything... (Enter to send)"
            rows={1}
            className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isPending}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}
