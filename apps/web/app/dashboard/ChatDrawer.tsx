'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { sendChatMessage, getChatHistory } from './chat-actions';

type Message = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history when first opened
  useEffect(() => {
    if (open && !historyLoaded) {
      getChatHistory()
        .then(h => {
          setMessages(h.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })));
          setHistoryLoaded(true);
        })
        .catch(() => setHistoryLoaded(true));
    }
  }, [open, historyLoaded]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  function handleSend() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    startTransition(async () => {
      try {
        const res = await sendChatMessage(text);
        setMessages(prev => [...prev, { role: 'assistant', content: res.message }]);
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: 'שגיאה בתקשורת עם VIGMIS. נסה שוב.' }]);
      }
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-colors text-2xl"
        aria-label="Ask VIGMIS"
      >
        💬
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={`fixed bottom-0 right-0 z-50 w-full max-w-md h-[70vh] bg-white shadow-2xl rounded-t-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <span className="font-bold text-gray-900">Ask VIGMIS</span>
            <span className="ml-2 text-xs text-gray-400">AI Marketing Manager</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && !isPending && (
            <div className="text-center text-sm text-gray-400 mt-8">
              <p className="text-2xl mb-2">🤖</p>
              <p>שאל אותי כל שאלה על הקמפיינים שלך</p>
              <p className="mt-1 text-xs">למשל: "מה ביצועי הקמפיין?" או "אשר את האופטימיזציה"</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id ?? i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isPending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-500">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>•</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>•</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>•</span>
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="שאל שאלה... (Enter לשליחה)"
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium transition-colors"
          >
            שלח
          </button>
        </div>
      </div>
    </>
  );
}
