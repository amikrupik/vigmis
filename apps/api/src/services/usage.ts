// Usage metering & quota enforcement — the live guardrail that stops a single
// customer (especially a low-budget, high-engagement one) from burning more in
// AI tokens than their fee covers. Limits live in billing/pricing.ts.
//
// What it enforces:
//   - chat: per-month AI conversation allowance + freeze when AI cost is too
//     high relative to the fee
//   - comments: per-month auto-triage allowance + freeze
//   - records every billable AI call's cost so the circuit breaker is accurate

import { db } from '@vigmis/db';
import {
  getAllowances, monthlyFee, breakerState, MESSAGES_PER_CONVERSATION,
  type Plan, type Allowances,
} from '../billing/pricing.js';
import { estimateManagedSpend, currentMonth } from '../billing/calculator.js';
import { sendEmail } from './notify.js';

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface MonthlyUsage {
  ai_cost_usd: number;
  chat_messages: number;
  comments_handled: number;
  breaker_state: 'ok' | 'degrade' | 'freeze';
}

export async function getUsage(tenantId: string): Promise<MonthlyUsage> {
  const { data } = await db.from('ai_usage_monthly')
    .select('ai_cost_usd, chat_messages, comments_handled, breaker_state')
    .eq('tenant_id', tenantId)
    .eq('period', currentPeriod())
    .maybeSingle();
  return {
    ai_cost_usd: Number(data?.ai_cost_usd ?? 0),
    chat_messages: data?.chat_messages ?? 0,
    comments_handled: data?.comments_handled ?? 0,
    breaker_state: (data?.breaker_state ?? 'ok') as MonthlyUsage['breaker_state'],
  };
}

/** Record the cost (and optional message/comment counts) of one AI call. */
export async function recordAiCost(
  tenantId: string,
  costUsd: number,
  opts: { messages?: number; comments?: number } = {},
): Promise<void> {
  await db.rpc('bump_ai_usage', {
    p_tenant: tenantId,
    p_period: currentPeriod(),
    p_cost: Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0,
    p_messages: opts.messages ?? 0,
    p_comments: opts.comments ?? 0,
  });
}

export interface BillingContext {
  plan: Plan;
  spendUsd: number;
  feeUsd: number;
  allowances: Allowances;
  usage: MonthlyUsage;
  breaker: 'ok' | 'degrade' | 'freeze';
}

export async function getBillingContext(tenantId: string): Promise<BillingContext> {
  const [billingRes, spendUsd, usage] = await Promise.all([
    db.from('billing_customers').select('plan').eq('tenant_id', tenantId).maybeSingle(),
    estimateManagedSpend(tenantId, currentMonth()),
    getUsage(tenantId),
  ]);
  const plan = (billingRes.data?.plan ?? 'free') as Plan;
  const feeUsd = monthlyFee(plan, spendUsd);
  const allowances = getAllowances(spendUsd);
  const breaker = breakerState(plan, feeUsd, usage.ai_cost_usd);
  return { plan, spendUsd, feeUsd, allowances, usage, breaker };
}

// Persist the breaker state and alert ops once, on transition into freeze.
async function syncBreaker(tenantId: string, ctx: BillingContext): Promise<void> {
  if (ctx.usage.breaker_state === ctx.breaker) return;
  try {
    await db.from('ai_usage_monthly')
      .update({ breaker_state: ctx.breaker, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('period', currentPeriod());
  } catch { /* best-effort */ }
  if (ctx.breaker === 'freeze') {
    try {
      await db.from('audit_log').insert({
        tenant_id: tenantId, action: 'ai_breaker.freeze', actor: 'system',
        payload: { fee_usd: ctx.feeUsd, ai_cost_usd: ctx.usage.ai_cost_usd },
      });
    } catch { /* best-effort */ }
    const ops = process.env.OPS_ALERT_EMAIL;
    if (ops) {
      await sendEmail(
        ops,
        `AI cost breaker froze tenant ${tenantId}`,
        `<pre>Monthly fee $${ctx.feeUsd.toFixed(2)}; AI cost $${ctx.usage.ai_cost_usd.toFixed(2)} (>= ${ctx.plan === 'pro' ? 40 : 30}% of fee).</pre>`,
      ).catch(() => null);
    }
  }
}

export interface QuotaResult {
  allowed: boolean;
  reason?: string;                       // user-facing soft-wall message
  breaker: 'ok' | 'degrade' | 'freeze';
  degrade: boolean;                      // caller should reduce work / use cheap model
}

/** Gate a chat message. Call before any LLM work in the chat handler. */
export async function checkChatQuota(tenantId: string): Promise<QuotaResult> {
  const ctx = await getBillingContext(tenantId);
  await syncBreaker(tenantId, ctx);
  const degrade = ctx.breaker === 'degrade';

  if (ctx.breaker === 'freeze') {
    return {
      allowed: false, breaker: 'freeze', degrade: true,
      reason: 'The AI assistant is paused for this month because usage passed your plan fair-use limit. It resumes on the 1st, or upgrade your plan to continue now.',
    };
  }
  const limitMessages = ctx.allowances.conversations * MESSAGES_PER_CONVERSATION;
  if (ctx.usage.chat_messages >= limitMessages) {
    return {
      allowed: false, breaker: ctx.breaker, degrade,
      reason: `You have used all ${ctx.allowances.conversations} AI conversations included in your plan this month. They renew on the 1st — or upgrade for more.`,
    };
  }
  return { allowed: true, breaker: ctx.breaker, degrade };
}

/** Gate comment auto-triage. Returns how many comments may still be handled. */
export async function checkCommentQuota(
  tenantId: string,
): Promise<QuotaResult & { remaining: number }> {
  const ctx = await getBillingContext(tenantId);
  await syncBreaker(tenantId, ctx);
  const degrade = ctx.breaker === 'degrade';
  const remaining = Math.max(0, ctx.allowances.commentsHandled - ctx.usage.comments_handled);

  if (ctx.breaker === 'freeze' || remaining <= 0) {
    return { allowed: false, remaining, breaker: ctx.breaker, degrade };
  }
  return { allowed: true, remaining, breaker: ctx.breaker, degrade };
}
