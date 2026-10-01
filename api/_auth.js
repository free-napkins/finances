import { createClient } from '@supabase/supabase-js'
import { sendJson } from './_claude.js'

// Gate for the AI routes: they spend the Anthropic key, so only a signed-in
// Supabase user may call them. The browser sends the session's access token
// as "Authorization: Bearer <token>" and Supabase confirms it here.
// Set ALLOWED_USER_EMAILS (comma separated) to limit them to specific accounts.

let supabase = null
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  if (!supabase) supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return supabase
}

// Running on your own machine (npm run dev / a local server), not a Vercel deployment.
const isLocal = () => !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development'

// Returns the signed-in user, or sends the error response and returns null.
export async function requireUser(req, res) {
  const client = getSupabase()
  if (!client) {
    // Without Supabase there's no way to know who's calling: allow it only locally.
    if (isLocal()) return { id: 'local', email: null }
    sendJson(res, 503, { error: 'Sign-in isn\'t configured on this deployment, so AI features are turned off.' })
    return null
  }

  const header = req.headers.authorization || req.headers.Authorization || ''
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    sendJson(res, 401, { error: 'Sign in (top right) to use the AI features.' })
    return null
  }

  const { data, error } = await client.auth.getUser(token)
  if (error || !data || !data.user) {
    sendJson(res, 401, { error: 'Your sign-in has expired. Sign in again to use the AI features.' })
    return null
  }

  const allowed = (process.env.ALLOWED_USER_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  if (allowed.length && !allowed.includes(String(data.user.email || '').toLowerCase())) {
    sendJson(res, 403, { error: 'This account isn\'t allowed to use the AI features.' })
    return null
  }
  return data.user
}
