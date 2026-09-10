export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript')
  res.status(200).send(
    `window.__FINANCE_CONFIG__ = ${JSON.stringify({
      supabaseUrl: process.env.VITE_SUPABASE_URL || '',
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
    })}`,
  )
}
