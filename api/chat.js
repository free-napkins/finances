import { askForJson, getClient, requirePost, sendClaudeError, sendJson } from './_claude.js'
import { requireUser } from './_auth.js'

// POST /api/chat  { messages: [{ role, content }], context: {...} }
// Talk to the budget coach. It answers from a snapshot of your data and,
// when you ask it to fix something, proposes edits. Edits are only
// proposals: the app shows each one with Apply / Skip and changes nothing
// until you press Apply.

const ACTIONS = [
  'update_transaction', 'delete_transaction', 'set_category_budget',
  'update_goal', 'update_income', 'delete_income', 'set_account_balance',
]
const FIELDS = ['amount', 'date', 'merchant', 'category', 'account', 'budget', 'target', 'saved', 'percent', 'deadline', 'name', 'source', 'balance', 'none']

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'edits'],
  properties: {
    reply: { type: 'string' },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'id', 'field', 'number', 'text', 'reason'],
        properties: {
          action: { type: 'string', enum: ACTIONS },
          id: { type: 'string' },
          field: { type: 'string', enum: FIELDS },
          number: { type: 'number' },
          text: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const SYSTEM = `You are the budget coach inside the user's personal finance app. You chat with them about their money: answer questions, explain their spending, budgets, pay and savings goals, and give practical, specific advice. All money is US dollars.

Every user turn ends with the current data as JSON (DATA). Base every number you mention on DATA; never invent transactions or amounts. Today's date is in DATA.today.

Keep replies short and conversational: a few sentences or a short list. Use plain text (no markdown headings or tables).

Fixing mistakes: when the user asks you to correct, change or remove something (or clearly says an entry is wrong), propose the change in "edits". The app shows each proposed edit to the user, who must press Apply, so in "reply" say what you're proposing ("Here's the fix — tap Apply"), never that it's already done. Only propose edits the user asked for or agreed to. If it's ambiguous which entry they mean, ask instead of guessing. Use ids exactly as they appear in DATA.

Edit format (unused fields: number 0, text ""):
- update_transaction: id = transaction id; field = amount (number) | date (text YYYY-MM-DD) | merchant (text) | category (text = category id) | account (text = account ref, or "" for none)
- delete_transaction: id = transaction id; field "none"
- set_category_budget: id = category id; field "budget"; number = new monthly budget
- update_goal: id = goal id; field = target | saved | percent (number) | deadline (text YYYY-MM-DD) | name (text). A goal with a complete-by date has its percent set automatically; change its deadline instead.
- update_income: id = income entry id; field = amount (number) | date (text) | source (text)
- delete_income: id = income entry id; field "none"
- set_account_balance: id = account ref (e.g. "bank::Checking"); field "balance"; number = the correct balance
Give each edit a one-line "reason".

When no edit is needed, return an empty edits array.`

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null
  const msgs = raw.slice(-20).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
  // The conversation must start with the user and alternate.
  while (msgs.length && msgs[0].role !== 'user') msgs.shift()
  const out = []
  for (const m of msgs) {
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n\n' + m.content
    else out.push(m)
  }
  return out.length && out[out.length - 1].role === 'user' ? out : null
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return
  if (!(await requireUser(req, res))) return
  if (!getClient()) return sendJson(res, 503, { error: 'The coach chat is not configured on this deployment.' })

  const body = req.body || {}
  const messages = cleanMessages(body.messages)
  if (!messages) return sendJson(res, 400, { error: 'Send a message to the coach.' })
  const context = body.context && typeof body.context === 'object' ? JSON.stringify(body.context) : '{}'
  if (context.length > 300_000) return sendJson(res, 400, { error: 'Too much data to send at once.' })
  // Current data rides along with the newest question only.
  const last = messages[messages.length - 1]
  last.content = last.content + '\n\nDATA:\n' + context

  try {
    const out = await askForJson({ system: SYSTEM, messages, schema: SCHEMA, effort: 'medium', maxTokens: 8000 })
    const edits = (Array.isArray(out.edits) ? out.edits : []).filter(e => ACTIONS.includes(e.action)).slice(0, 10)
    return sendJson(res, 200, { reply: String(out.reply || '').trim(), edits })
  } catch (error) {
    return sendClaudeError(res, error, 'The coach is temporarily unavailable.')
  }
}
