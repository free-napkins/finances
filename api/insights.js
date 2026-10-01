import { askForJson, getClient, requirePost, sendClaudeError, sendJson } from './_claude.js'
import { requireUser } from './_auth.js'

function ids(list) {
  return Array.isArray(list)
    ? list.map(item => item && item.id).filter(id => typeof id === 'string' && id).slice(0, 60)
    : []
}

function insightsSchema(categoryIds) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'patterns', 'budget_changes', 'savings_tips'],
    properties: {
      headline: { type: 'string' },
      patterns: { type: 'array', items: { type: 'string' } },
      budget_changes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['category_id', 'suggested_budget', 'reason'],
          properties: {
            category_id: { type: 'string', enum: categoryIds.length ? categoryIds : ['none'] },
            suggested_budget: { type: 'number' },
            reason: { type: 'string' },
          },
        },
      },
      savings_tips: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'detail', 'estimated_monthly_savings'],
          properties: {
            title: { type: 'string' },
            detail: { type: 'string' },
            estimated_monthly_savings: { type: 'number' },
          },
        },
      }
    },
  }
}

const SYSTEM = `You are the budgeting coach inside a personal finance app. The user tracks spending in monthly budget categories (like a Google Sheets budget), scans receipts, gets paid daily, and splits each day's pay across savings goals.

You receive a JSON summary of their data. All money values are in the currency given by "currency". Study it for patterns and return:
- headline: one short, specific sentence on how this month is going.
- patterns: 2-5 concrete observations grounded in the numbers (recurring overspending, a merchant that dominates a category, a card used for impulse buys, weekend spikes, categories that are always under budget).
- budget_changes: only categories whose budget should change, with a realistic new monthly budget. Raise budgets that are chronically blown for fixed needs (rent, gas); trim ones with steady slack or discretionary overspending. Explain each in one sentence using their numbers. Return none when the data is too thin to judge.
- savings_tips: 1-4 specific, actionable ways to spend less, each with a rough monthly savings estimate.

The app already sets each dated goal's share of pay automatically (see savings_plan), so don't propose savings percentages; you may mention the plan when it's relevant.

Be honest and encouraging. Do not invent transactions or numbers that are not in the data.`

const DAILY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['bullets'],
  properties: { bullets: { type: 'array', items: { type: 'string' } } },
}

const DAILY_SYSTEM = `You are the budgeting coach inside a personal finance app. Each morning you greet the user with exactly three short bullet points for their financial well-being today.

You receive a JSON summary of their budget categories, spending, daily pay, savings goals (with "complete by" dates) and the automatic savings plan. All money is US dollars.

Rules for the bullets:
- Exactly 3 bullets, each one sentence of at most 20 words, no leading dash or emoji.
- Use their real numbers (dollars, percentages, dates) and name specific categories or goals.
- Cover: 1) how spending is tracking this month, 2) savings goals / how much to set aside, 3) one concrete action for today.
- Warm and direct. Never invent data that is not in the summary.`

export default async function handler(req, res) {
  if (!requirePost(req, res)) return
  if (!(await requireUser(req, res))) return
  if (!getClient()) return sendJson(res, 503, { error: 'AI insights are not configured on this deployment.' })

  const summary = req.body && req.body.summary
  if (!summary || typeof summary !== 'object') return sendJson(res, 400, { error: 'Missing budget summary.' })
  const serialized = JSON.stringify(summary)
  if (serialized.length > 200_000) return sendJson(res, 400, { error: 'Too much data to analyze at once.' })

  try {
    if (req.body.mode === 'daily') {
      const daily = await askForJson({ system: DAILY_SYSTEM, schema: DAILY_SCHEMA, effort: 'low', maxTokens: 4000, content: serialized })
      const bullets = (daily.bullets || []).map(b => String(b).replace(/^[-•*\s]+/, '').trim()).filter(Boolean).slice(0, 3)
      return sendJson(res, 200, { bullets })
    }
    const insights = await askForJson({
      system: SYSTEM,
      schema: insightsSchema(ids(summary.categories)),
      effort: 'high',
      content: serialized,
    })
    return sendJson(res, 200, { insights })
  } catch (error) {
    return sendClaudeError(res, error, 'The budget coach is temporarily unavailable.')
  }
}
