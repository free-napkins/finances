(function () {
  function start() {
    const config = window.__FINANCE_CONFIG__ || {}
    if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) return
    const client = window.__financeSupabase || window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    window.__financeSupabase = client
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Sign in'
    button.style.cssText = 'position:fixed;top:12px;right:12px;z-index:200;padding:7px 11px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(10,10,11,.75);color:#b8b6b0;font:600 11px inherit;cursor:pointer'
    document.body.appendChild(button)
    async function paint(session) {
      window.__financeAuth.session = session
      button.textContent = session ? 'Sign out' : 'Sign in'
      button.onclick = async function () {
        if (session) return client.auth.signOut()
        const email = window.prompt('Supabase email')
        if (!email) return
        const password = window.prompt('Password')
        if (!password) return
        const result = await client.auth.signInWithPassword({ email: email.trim(), password })
        if (result.error) window.alert(result.error.message)
      }
    }
    client.auth.getSession().then(({ data }) => paint(data.session))
    client.auth.onAuthStateChange((_event, session) => paint(session))
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
