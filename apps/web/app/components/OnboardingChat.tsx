'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { sendMessage } from '../onboarding/actions';
import type { Topic, OnboardingSettings } from '../onboarding/actions';
import type { ConversationMessage } from '@vigmis/db';

const TOPIC_LABELS: Record<Topic, string> = {
  website: 'אתר',
  budget: 'תקציב',
  management_percentage: '% ניהול',
  goal: 'יעד',
  geography: 'גיאוגרפיה',
  exclusions: 'הגבלות',
  open_notes: 'הערות',
};

const ALL_TOPICS: Topic[] = ['website', 'budget', 'management_percentage', 'goal', 'geography', 'exclusions', 'open_notes'];

interface Props {
  onConfirm: (settings: OnboardingSettings, conversation: ConversationMessage[]) => void;
}

export default function OnboardingChat({ onConfirm }: Props) {
  const [history, setHistory] = useState<ConversationMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'm Vigmis — your AI marketing manager. To build you the right campaign, I need a few details. Let's start — what's your website URL?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [coveredTopics, setCoveredTopics] = useState<Topic[]>([]);
  const [settings, setSettings] = useState<OnboardingSettings | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isListening, setIsListening] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  function startVoice() {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'he-IL';
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      setInput(e.results[0][0].transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function submit() {
    if (!input.trim() || isPending) return;
    const userMsg: ConversationMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...history, userMsg];
    setHistory(nextHistory);
    setInput('');

    setSubmitError(null);
    startTransition(async () => {
      try {
        const result = await sendMessage(nextHistory, userMsg.content, coveredTopics);
        const aiMsg: ConversationMessage = {
          role: 'assistant',
          content: result.message,
          timestamp: new Date().toISOString(),
        };
        setHistory(prev => [...prev, aiMsg]);
        setCoveredTopics(result.coveredTopics);
        if (result.settings) setSettings(result.settings);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'שגיאה בתקשורת עם הבינה המלאכותית. אנא נסה שוב.');
      }
    });
  }

  const allDone = coveredTopics.length === ALL_TOPICS.length && settings !== null;
  const managedBudget = settings
    ? Math.round((settings.budget_monthly_ils / 3.7) * (settings.management_percentage / 100))
    : 0;
  const fee = settings
    ? Math.round(managedBudget * 0.07)
    : 0;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="flex gap-1.5 p-4 border-b border-gray-100 overflow-x-auto">
        {ALL_TOPICS.map(topic => (
          <div
            key={topic}
            className={`flex-shrink-0 text-center text-xs py-1 px-2 rounded-full transition-colors ${
              coveredTopics.includes(topic)
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {TOPIC_LABELS[topic]}
          </div>
        ))}
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isPending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        {submitError && (
          <div className="flex justify-start">
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-bl-sm px-4 py-2 text-sm max-w-[80%]">
              {submitError}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Settings summary + confirm */}
      {allDone && settings && (
        <div className="border-t border-green-200 bg-green-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-green-800">סיכום — אשר כדי להמשיך לניתוח</p>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
            <div className="col-span-2"><span className="font-medium">אתר:</span> {settings.website_url}</div>
            <div><span className="font-medium">תקציב:</span> ₪{settings.budget_monthly_ils.toLocaleString()}/חודש</div>
            <div><span className="font-medium">ניהול:</span> {settings.management_percentage}% (~${managedBudget})</div>
            <div><span className="font-medium">יעד:</span> {settings.goal}</div>
            <div><span className="font-medium">עמלה (Free):</span> ~${fee}/חודש</div>
            <div className="col-span-2"><span className="font-medium">מיקוד:</span> {settings.geo_include.join(', ')}</div>
            {settings.geo_exclude.length > 0 && (
              <div className="col-span-2"><span className="font-medium">לא לטרגט:</span> {settings.geo_exclude.join(', ')}</div>
            )}
            {settings.exclusions && (
              <div className="col-span-2"><span className="font-medium">מגבלות:</span> {settings.exclusions}</div>
            )}
          </div>
          <button
            onClick={() => onConfirm(settings, history)}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors"
          >
            אשר — נתחיל ניתוח שוק ←
          </button>
        </div>
      )}

      {/* Input area */}
      {!allDone && (
        <div className="border-t border-gray-100 p-4 flex gap-2">
          <button
            type="button"
            onMouseDown={startVoice}
            onMouseUp={stopVoice}
            onTouchStart={startVoice}
            onTouchEnd={stopVoice}
            className={`p-2 rounded-xl transition-colors ${
              isListening ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title="לחץ ודבר"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-1 14.93V19h-2v2h6v-2h-2v-1.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z" />
            </svg>
          </button>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="הקלד או דבר..."
            disabled={isPending}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-400 disabled:opacity-50"
            dir="auto"
          />
          <button
            onClick={submit}
            disabled={isPending || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            שלח
          </button>
        </div>
      )}
    </div>
  );
}
