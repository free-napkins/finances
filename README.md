# Finances

Static Vercel finance dashboard with Supabase authentication and per-user state sync.

## Setup

Sign-in uses the shared Box of Jelly account at `accounts.boxofjelly.xyz` (see the `accounts` repo). The app runs at `finances.boxofjelly.xyz`.

1. Run `macros/supabase/accounts-01-usernames-and-sync.sql` on the Supabase project (it creates `finance_kv`, the per-key sync table this app uses).
2. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.
3. Configure `ANTHROPIC_API_KEY` in Vercel. It powers receipt scanning (`api/receipt.js`, which sorts items into budget categories) and the budget coach (`api/insights.js`).
4. The AI routes only answer signed-in accounts that passed 2FA (`api/_auth.js`). Set `ALLOWED_USER_EMAILS` (comma separated) to limit them to your own account(s). Locally, with no Supabase settings, they're open for testing and the app runs offline.

- `auth.js` + `boxauth.js`: redirect to the accounts site when signed out (clearing this browser's copy of the data), the account button, and the shared `.boxofjelly.xyz` session cookie.
- `sync.js`: per-key sync with `finance_kv`, live updates over Realtime, merge on a device's first sync.

## Tabs

Budget, Payday, Score and Worth, plus the ✨ budget coach bubble in the tab bar.

- `budget.js` / `budget.css`: monthly budget categories with receipts, transactions and cards/cash; daily pay with suggested savings splits across goals; a Monday–Sunday weekly score. Data is stored under the synced `budget:` localStorage prefix.
- `charts.js`: the switchable graph on the Budget page (11 views such as spending by category, pace, pay and savings, each drawable as any chart type that fits it).
- `chart-kit.js`: the chart engine: 10 chart types, 10 designs, 10 colorblind-checked color schemes and per-type animations. `design-lab/chart-kit.js` is a copy of this file; re-copy it after changes. The Design Lab's Charts tab sends picks here via `#chart-style=…`, saved as `budget:chartStyle`.
- `coach.js`: the budget coach. Pops up from the bubble on every open with three AI tips for the day (`/api/insights` `mode: 'daily'`, cached once a day in `budget:coachDaily`, with number-based tips when the AI is unavailable), the savings autopilot, and the weekly spending analysis (`budget:insights`).
- Savings autopilot (`autoPlan` in `budget.js`): for each goal with a complete-by date, sets the % of each payday needed to finish on time from the last 30 days of pay (`budget:savingsPlan`).
- `usd-migration.js`: everything is US dollars. Older data stored in CHF is converted once (locally and when pulled from Supabase), tracked by the `nw:currency_base` key.
