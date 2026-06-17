'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { sendMessage } from '../onboarding/actions';
import type { Topic, OnboardingSettings } from '../onboarding/actions';
import type { ConversationMessage } from '@vigmis/db';

const TOPIC_LABELS: Record<Topic, string> = {
  business_type: 'Business Type',
  website: 'Website',
  budget: 'Budget',
  management_percentage: '% Managed',
  goal: 'Goal',
  margin_pct: 'Margin %',
  hero_product: 'Hero Product',
  geography: 'Geography',
  exclusions: 'Restrictions',
  open_notes: 'Notes',
};

const ALL_TOPICS: Topic[] = ['business_type', 'website', 'budget', 'management_percentage', 'goal', 'margin_pct', 'hero_product', 'geography', 'exclusions', 'open_notes'];

interface Props {
  onConfirm: (settings: OnboardingSettings, conversation: ConversationMessage[]) => void;
}

const GREETING_EN = "Hi! I'm Vigmis — your AI marketing manager. To build the right campaign for you, I need a few details. First — what type of business do you have? (e.g. online store, local service, lead generation, SaaS, or a business focused on one flagship product)";
const GREETING_HE = "היי! אני Vigmis — מנהל הפרסום שלך. כדי לבנות עבורך את הקמפיין הנכון, אני צריך כמה פרטים. ראשית — מה סוג העסק שלך? (למשל: חנות אונליין, שירות מקומי, יצירת לידים, SaaS, או עסק המתמקד במוצר מרכזי)";
const GREETING_AR = "مرحباً! أنا Vigmis — مدير التسويق الرقمي الخاص بك. لبناء الحملة المناسبة لك، أحتاج إلى بعض التفاصيل. أولاً — ما نوع عملك؟ (مثلاً: متجر إلكتروني، خدمة محلية، توليد عملاء، SaaS، أو عمل يركز على منتج رئيسي)";

export default function OnboardingChat({ onConfirm }: Props) {
  const [history, setHistory] = useState<ConversationMessage[]>([
    {
      role: 'assistant',
      content: GREETING_EN,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [coveredTopics, setCoveredTopics] = useState<Topic[]>([]);
  const [settings, setSettings] = useState<OnboardingSettings | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isListening, setIsListening] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lang, setLang] = useState<string>('en');
  const [isRevising, setIsRevising] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Set greeting language from vigmis_lang cookie on mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const detectedLang = document.cookie.match(/vigmis_lang=([^;]+)/)?.[1] ?? 'en';
    setLang(detectedLang);
    const greeting = detectedLang === 'he' ? GREETING_HE : detectedLang === 'ar' ? GREETING_AR : GREETING_EN;
    setHistory([{ role: 'assistant', content: greeting, timestamp: new Date().toISOString() }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Re-focus the input after every AI response so the user can type immediately
    if (!isPending) inputRef.current?.focus();
  }, [history, isPending]);

  function startVoice() {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = lang === 'he' ? 'he-IL' : lang === 'ar' ? 'ar-AE' : 'en-US';
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
    setIsRevising(false);
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
        setSubmitError(err instanceof Error ? err.message : 'Connection error. Please try again.');
      }
    });
  }

  // allDone = API returned a parsed [SUMMARY] block (settings). coveredTopics count
  // doesn't need to reach 10 — optional topics (margin_pct, hero_product) may be skipped.
  const allDone = settings !== null;
  const managedBudget = settings
    ? Math.round((settings.budget_monthly_ils / 3.7) * (settings.management_percentage / 100))
    : 0;
  const fee = settings ? Math.round(managedBudget * 0.07) : 0;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      {/* Topic progress */}
      <div className="flex gap-1.5 px-6 py-3 border-b border-slate-100 overflow-x-auto flex-shrink-0">
        {ALL_TOPICS.map(topic => (
          <div
            key={topic}
            className={`flex-shrink-0 text-center text-xs py-1 px-2.5 rounded-full font-medium transition-colors ${
              coveredTopics.includes(topic)
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            {TOPIC_LABELS[topic]}
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {submitError && (
          <div className="flex justify-start">
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm max-w-[80%]">
              {submitError}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Summary + confirm */}
      {allDone && settings && (
        <div className="border-t border-emerald-200 bg-emerald-50 px-6 py-4 space-y-3 flex-shrink-0">
          {(() => {
            const isAr = lang === 'ar';
            const isHe = lang === 'he';
            const L = isHe ? {
              title: 'סיכום — אשר להמשיך',
              website: 'אתר',
              budget: 'תקציב',
              managed: 'ניהול',
              goal: 'מטרה',
              fee: 'עמלה (תוכנית Grow)',
              targeting: 'טירגוט',
              exclude: 'מוחרג',
              restrictions: 'הגבלות',
              revise: '→ תקן תשובה',
              confirm: 'אשר — התחל ניתוח →',
            } : isAr ? {
              title: 'ملخص — أكد للمتابعة',
              website: 'الموقع',
              budget: 'الميزانية',
              managed: 'المُدار',
              goal: 'الهدف',
              fee: 'الرسوم (خطة Grow)',
              targeting: 'الاستهداف',
              exclude: 'مستبعد',
              restrictions: 'القيود',
              revise: '→ مراجعة إجابة',
              confirm: 'تأكيد — ابدأ التحليل →',
            } : {
              title: 'Summary — confirm to continue',
              website: 'Website',
              budget: 'Budget',
              managed: 'Managed',
              goal: 'Goal',
              fee: 'Fee (Grow plan)',
              targeting: 'Targeting',
              exclude: 'Exclude',
              restrictions: 'Restrictions',
              revise: '← Revise an answer',
              confirm: 'Confirm — Start Analysis →',
            };
            return (
              <>
                <p className="text-sm font-semibold text-emerald-800">{L.title}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-slate-700">
                  <div className="col-span-2">
                    <span className="font-medium text-slate-500">{L.website}:</span>{' '}
                    <span className="font-medium">{settings.website_url}</span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">{L.budget}:</span>{' '}
                    {(() => {
                      const currency = settings.budget_currency ?? 'ILS';
                      const orig = settings.budget_original_amount;
                      if (orig && currency !== 'ILS') {
                        const symbol = currency === 'USD' ? '$' : currency === 'AED' ? 'AED ' : currency + ' ';
                        return `${symbol}${orig.toLocaleString()}/mo`;
                      }
                      return `₪${settings.budget_monthly_ils.toLocaleString()}/mo`;
                    })()}
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">{L.managed}:</span>{' '}
                    {settings.management_percentage}% (~${managedBudget})
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">{L.goal}:</span>{' '}
                    <span className="capitalize">{settings.goal}</span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">{L.fee}:</span>{' '}
                    ~${fee}/mo
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-slate-500">{L.targeting}:</span>{' '}
                    {(settings.geo_include ?? []).join(', ')}
                  </div>
                  {(settings.geo_exclude ?? []).length > 0 && (
                    <div className="col-span-2">
                      <span className="font-medium text-slate-500">{L.exclude}:</span>{' '}
                      {(settings.geo_exclude ?? []).join(', ')}
                    </div>
                  )}
                  {settings.exclusions && (
                    <div className="col-span-2">
                      <span className="font-medium text-slate-500">{L.restrictions}:</span>{' '}
                      {settings.exclusions}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    // Strip [SUMMARY]...[/SUMMARY] from the last AI message so the next
                    // user turn doesn't immediately re-trigger another summary.
                    setHistory(prev => prev.map((msg, i) =>
                      i === prev.length - 1 && msg.role === 'assistant'
                        ? { ...msg, content: msg.content.replace(/\[SUMMARY\][\s\S]*?\[\/SUMMARY\]/g, '').trim() || msg.content }
                        : msg
                    ));
                    setIsRevising(true);
                    setSettings(null);
                  }}
                  className="w-full text-sm text-slate-500 hover:text-slate-700 py-1.5 transition-colors"
                >
                  {L.revise}
                </button>
                <button
                  onClick={() => onConfirm(settings, history)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  {L.confirm}
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Input */}
      {!allDone && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 flex gap-2 flex-shrink-0">
          <button
            type="button"
            onMouseDown={startVoice}
            onMouseUp={stopVoice}
            onTouchStart={startVoice}
            onTouchEnd={stopVoice}
            className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${
              isListening ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
            title="Hold to speak"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-1 14.93V19h-2v2h6v-2h-2v-1.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setIsRevising(false); submit(); } }}
            placeholder={
              isRevising
                ? lang === 'he'
                  ? 'כתוב כאן מה תרצה שאתקן מהתשובות שנתת...'
                  : lang === 'ar'
                    ? 'اكتب هنا ما تريد تصحيحه من إجاباتك السابقة...'
                    : 'Tell me what you\'d like me to correct or change from your previous answers...'
                : 'Type your answer...'
            }
            disabled={isPending}
            autoFocus
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 bg-white"
            dir="auto"
          />
          <button
            onClick={submit}
            disabled={isPending || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
