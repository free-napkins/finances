import { askForJson, getClient, requirePost, sendClaudeError, sendJson } from './_claude.js'
import { requireUser } from './_auth.js'

const VALID_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

function cleanCategories(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(category => category && typeof category.id === 'string' && typeof category.name === 'string')
    .slice(0, 60)
    .map(category => ({ id: category.id.slice(0, 64), name: category.name.slice(0, 60) }))
}

function receiptSchema(categoryIds) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['readable', 'kind', 'source', 'amount', 'date', 'payment_hint', 'items'],
    properties: {
      readable: { type: 'boolean' },
      kind: { type: 'string', enum: ['expense', 'balance'] },
      source: { type: 'string' },
      amount: { type: 'number' },
      date: { type: 'string' },
      payment_hint: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'amount', 'category_id'],
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            category_id: { type: 'string', enum: categoryIds.length ? categoryIds : ['none'] },
          },
        },
      },
    },
  }
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return
  if (!(await requireUser(req, res))) return
  if (!getClient()) return sendJson(res, 503, { error: 'Receipt reading is not configured on this deployment.' })

  const body = req.body || {}
  const image = typeof body.image === 'string' ? body.image : ''
  const mediaType = VALID_MEDIA_TYPES.has(body.mediaType) ? body.mediaType : 'image/jpeg'
  if (!image || image.length > 12_000_000) {
    return sendJson(res, 400, { error: 'Please upload a smaller receipt image.' })
  }
  const categories = cleanCategories(body.categories)
  const categoryList = categories.length
    ? categories.map(category => `- ${category.id}: ${category.name}`).join('\n')
    : '- none: (no categories set up)'

  const system = `You read photos of receipts and banking screens for a personal budgeting app. All amounts are US dollars.

For a store receipt, use kind "expense", source = the merchant name, amount = the final total paid. List every purchased line item with its price, and assign each one to the budget category it best belongs to. Leave tax, tip, discount, and subtotal lines out of items; the app spreads the difference between the item sum and the total across the items. If the receipt shows no individual items, return one item named after the merchant for the full total.

For a bank or account screenshot, use kind "balance", source = the account or institution, amount = the current available balance, and an empty items list.

Budget categories (id: name):
${categoryList}

payment_hint: how the receipt says it was paid, copied as printed (for example "VISA ****4821", "Debit 1234", "CASH"), or "" if not shown.
date: YYYY-MM-DD if a date is printed, otherwise "".
Set readable to false, with amount 0, only when no reliable amount can be read. Use 0 or "" rather than guessing.`

  try {
    const receipt = await askForJson({
      system,
      schema: receiptSchema(categories.map(category => category.id)),
      effort: 'medium',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: 'Read this image.' },
      ],
    })
    return sendJson(res, 200, { receipt })
  } catch (error) {
    return sendClaudeError(res, error, 'The receipt reader is temporarily unavailable.')
  }
}
