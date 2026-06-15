// Internal cron scheduler — zero dependencies.
//
// Fires HTTP POST requests to the API's own cron endpoints via localhost,
// passing the CRON_SECRET header. This means:
//   - No external scheduler required (Railway, Cron services, etc.)
//   - All endpoints remain independently callable for debugging
//   - DISABLE_SCHEDULER=true skips all scheduling (useful in dev/testing)
//
// All times are UTC.

import { cronSecretHeader } from './middleware/secrets.js';

const BASE = `http://localhost:${process.env.PORT ?? 4000}`;

function post(path: string) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'x-cron-secret': cronSecretHeader(), 'Content-Type': 'application/json' },
  }).catch(err => console.error(`[scheduler] ${path} failed:`, (err as Error).message));
}

/** Fire fn() at the next occurrence of UTC hh:mm, then repeat daily. */
function daily(hour: number, minute: number, fn: () => void): void {
  function schedule() {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(hour, minute, 0, 0);
    if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
    setTimeout(() => { fn(); schedule(); }, target.getTime() - now.getTime());
  }
  schedule();
}

/** Fire fn() at the next occurrence of UTC hh:mm on the given weekday (0=Sun…6=Sat), then repeat weekly. */
function weekly(dayOfWeek: number, hour: number, minute: number, fn: () => void): void {
  function schedule() {
    const now = new Date();
    const target = new Date(now);
    const daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7;
    target.setUTCDate(target.getUTCDate() + daysUntil);
    target.setUTCHours(hour, minute, 0, 0);
    if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
    setTimeout(() => { fn(); schedule(); }, target.getTime() - now.getTime());
  }
  schedule();
}

/** Fire fn() every intervalMs milliseconds, starting after the first interval. */
function every(minutes: number, fn: () => void): void {
  setInterval(fn, minutes * 60 * 1000);
}

export function startScheduler(): void {
  if (process.env.DISABLE_SCHEDULER === 'true') {
    console.log('[scheduler] disabled (DISABLE_SCHEDULER=true)');
    return;
  }

  // ── Social ─────────────────────────────────────────────────────────────────
  every(15,  () => post('/social/cron/publish'));          // publish approved posts
  every(120, () => post('/social/cron/comments'));         // fetch new comments
  daily(6, 0,   () => post('/social/cron/analytics'));     // sync engagement stats
  weekly(1, 3, 0, () => post('/social/cron/weekly'));      // generate next week (Mon 03:00)

  // ── Optimization ──────────────────────────────────────────────────────────
  every(240, () => post('/optimization/run-all'));          // run for all tenants

  // ── Decision Protocols ────────────────────────────────────────────────────
  every(60, () => post('/protocols/expire-all'));           // expire stale approvals

  // ── GA4 ──────────────────────────────────────────────────────────────────
  daily(5, 0, () => post('/ga4/cron/sync'));                // daily data pull

  // ── Notifications ─────────────────────────────────────────────────────────
  daily(7, 0,    () => post('/notifications/daily'));       // morning report
  daily(8, 30,   () => post('/briefings/cron'));            // briefings dispatch
  weekly(1, 8, 0, () => post('/notifications/digest'));     // weekly digest (Mon 08:00)
  daily(1, 30, () => {                                      // monthly (1st at 01:30)
    if (new Date().getUTCDate() === 1) {
      post('/billing/invoice');
      post('/notifications/monthly');
    }
  });

  // ── Comments Intelligence ─────────────────────────────────────────────────
  daily(10, 0,    () => post('/comments/cron/priority'));   // score new comments
  weekly(1, 11, 0, () => post('/comments/cron/insights')); // mine themes (Mon 11:00)
  weekly(2, 12, 0, () => post('/comments/cron/digest'));   // lead digest (Tue 12:00)
  daily(10, 30,   () => post('/comments/cron/crisis'));     // crisis check

  // ── AI Visibility ─────────────────────────────────────────────────────────
  weekly(0, 2, 0, () => post('/geo/refresh-all'));          // Sun 02:00

  // ── Website re-crawl ──────────────────────────────────────────────────────
  weekly(1, 4, 0, () => post('/cron/website-recrawl'));     // Mon 04:00

  // ── Strategic Brain ───────────────────────────────────────────────────────
  weekly(1, 9, 0, () => post('/intelligence/cron/strategic-weekly')); // Mon 09:00

  // ── Intelligence Engines (new) ────────────────────────────────────────────
  daily(6, 30, () => post('/intelligence/cron/portfolio-allocator'));  // daily after main engine
  daily(7, 30, () => post('/intelligence/cron/outcome-tracker'));      // daily outcome check
  weekly(1, 10, 0, () => post('/intelligence/cron/data-maturity'));    // Mon 10:00 weekly

  // ── Compliance ────────────────────────────────────────────────────────────
  daily(2, 0, () => {
    post('/compliance/cron/reattestation');
    post('/compliance/cron/stop-loss');
    post('/compliance/cron/recompute-trust');
  });

  // ── Operational ───────────────────────────────────────────────────────────
  daily(3, 0,  () => post('/ops/cron/news-scan'));
  daily(4, 0,  () => post('/ops/cron/weather'));
  daily(4, 30, () => post('/ops/cron/shopify-sync'));
  daily(5, 30, () => post('/ops/cron/ghost-cleanup'));
  daily(6, 30, () => post('/ops/cron/creative-discard'));
  daily(0, 30, () => {
    if (new Date().getUTCDate() === 1) post('/ops/cron/ai-landscape');
  });

  // ── History ───────────────────────────────────────────────────────────────
  // History snapshot is triggered from /notifications/monthly (already chained).

  console.log('[scheduler] all jobs registered');
}
