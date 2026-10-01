// Finance keeps the app usable offline; authentication is provided by the top bar.
window.__financeAuth = {
  session: null,
  // Headers for the AI endpoints (api/receipt, api/insights), which only answer
  // signed-in users. getSession() hands back a refreshed token when needed.
  async headers() {
    const client = window.__financeSupabase
    if (!client) return {}
    try {
      const { data } = await client.auth.getSession()
      return data && data.session ? { Authorization: 'Bearer ' + data.session.access_token } : {}
    } catch (_) {
      return {}
    }
  }
}
