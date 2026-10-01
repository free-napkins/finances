import Anthropic from '@anthropic-ai/sdk'

// Shared by the api/ routes. Files starting with "_" are not deployed as routes.
export const MODEL = 'claude-opus-5'

export function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json')
  res.status(status).json(body)
}

export function requirePost(req, res) {
  if (req.method === 'POST') return true
  res.setHeader('Allow', 'POST')
  sendJson(res, 405, { error: 'Method not allowed.' })
  return false
}

let client = null
export function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!client) client = new Anthropic()
  return client
}

// One structured-output call. `schema` constrains the reply to JSON, so the
// result is parsed directly. Refusals fall back server-side to another model.
// Pass `content` for a single question, or `messages` for a conversation.
export async function askForJson({ system, content, messages, schema, effort = 'medium', maxTokens = 8000 }) {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: messages || [{ role: 'user', content }],
  })
  if (response.stop_reason === 'refusal') throw new ClaudeError(422, 'The AI declined to process that request.')
  if (response.stop_reason === 'max_tokens') throw new ClaudeError(502, 'The AI reply was cut off. Try again.')
  const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('')
  try {
    return JSON.parse(text)
  } catch (_) {
    throw new ClaudeError(502, 'The AI returned an unreadable result.')
  }
}

export class ClaudeError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function sendClaudeError(res, error, fallbackMessage) {
  if (error instanceof ClaudeError) return sendJson(res, error.status, { error: error.message })
  if (error instanceof Anthropic.RateLimitError) return sendJson(res, 429, { error: 'The AI is busy right now. Try again in a minute.' })
  if (error instanceof Anthropic.AuthenticationError) return sendJson(res, 503, { error: 'The AI key on this deployment is invalid.' })
  if (error instanceof Anthropic.BadRequestError) return sendJson(res, 400, { error: error.message || fallbackMessage })
  if (error instanceof Anthropic.APIError) return sendJson(res, 502, { error: fallbackMessage })
  return sendJson(res, 502, { error: fallbackMessage })
}
