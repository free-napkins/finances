(function () {
  const KEYS = ['subs', 'wishlist', 'incoming_orders', 'nw_currency', 'nw:activity', 'nw:history']
  const PREFIXES = ['nw:']
  let lastPayload = ''

  function readState() {
    const state = {}
    const keys = new Set(KEYS)
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && PREFIXES.some((prefix) => key.startsWith(prefix))) keys.add(key)
    }
    keys.forEach((key) => {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        try { state[key] = JSON.parse(raw) } catch (_) { state[key] = raw }
      }
    })
    return state
  }

  async function start() {
    const config = window.__FINANCE_CONFIG__ || {}
    if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) return
    const client = window.__financeSupabase || window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    window.__financeSupabase = client
    const { data } = await client.auth.getSession()
    if (!data.session) return
    const userId = data.session.user.id
    const loaded = await client.from('finance_state').select('data').eq('user_id', userId).maybeSingle()
    if (loaded.data && loaded.data.data) {
      Object.entries(loaded.data.data).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)))
      window.dispatchEvent(new Event('storage'))
    }
    async function push() {
      const state = readState()
      const payload = JSON.stringify(state)
      if (payload === lastPayload) return
      lastPayload = payload
      await client.from('finance_state').upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() })
    }
    await push()
    window.setInterval(push, 2000)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
