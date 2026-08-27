# Passbook

A private, mobile-friendly personal finance dashboard for managing budgets, transactions, time deposits, financial goals, and planning insights.

一個適合手機使用的個人財務儀表板，用於管理預算、收支流水、定期存款、財務目標及規劃建議。

## Features

- Email registration and sign-in with Supabase Auth
- Cloud-synced personal data across devices
- Overview of net worth, deposits, savings, and goals
- Budget planning and monthly ledger / P&L tracking
- Time-deposit list, maturity ladder, renewal status, and interest estimates
- Financial goals, progress tracking, and planning insights
- Traditional Chinese / English interface switch, driven by React state (not DOM text-patching)
- HKD, USD and CNY support for income, budget, transactions and deposits, converted to a HKD total with editable exchange rates
- Mobile-friendly interface and explicit sign-out control

## Stack

- React + Vite
- Recharts
- Supabase Auth + Postgres
- Vercel

## Cloud data model

The app saves each authenticated user's dashboard state in `public.passbook_state` in Supabase. Row Level Security restricts a user to their own record.

## Local development

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Deployment

Push changes to the `main` branch. Vercel is connected to this repository and automatically creates a Production deployment.

## Changelog

### Update policy

Every user-visible feature, interface, deployment, or security change must update this README with its relevant feature note or changelog entry.

### Current

- Added Supabase email authentication and cloud-synced personal data.
- Added Vercel Production deployment from the `main` branch.
- Added a Traditional Chinese / English UI switch and a mobile sign-out control.
- Positioned the language switch at the top centre with reserved header space to avoid obscuring page content.
- Added a date-safety guard so temporarily blank or invalid time-deposit dates do not crash the dashboard.
- Rebuilt the language switch as a proper React-driven i18n layer (`src/i18n.js`), replacing the DOM text-replacement script that only translated a partial, hard-to-maintain set of strings.
- Fixed the exchange-rate field on the Deposits tab, which edited an unused `settings.fx` value instead of the `settings.rates` actually used for HKD conversion; removed the related dead `fx` output and the `globalThis.fx` workaround.
- Added CNY as a third supported currency (alongside HKD and USD) for deposits, income, budget lines and ledger transactions, with editable USD and CNY exchange rates; all totals (net worth, budget, savings rate, P&L) convert consistently to HKD. Existing records default to HKD non-destructively.
- Replaced the global `Date.prototype` patch (added as a page-wide workaround for the "Invalid time value" crash) with a scoped date guard in the app's own date helpers.
- Switched the JSX build to `@vitejs/plugin-react`'s automatic runtime, removing the `globalThis.React` workaround that had been needed because Vite's default classic JSX transform requires `React` in scope.
- Replaced the Tailwind CDN script (not recommended for production — no purge, runtime JIT compile) with a small local utility stylesheet covering only the classes the app actually uses.
- Consolidated the Supabase project URL/key into a single `src/supabaseClient.js` instead of duplicating them across `index.html` and `src/main.jsx`.
- Fixed several spots (header net worth, deposit rows, next-renewal card) where a long bank name or a large HKD figure could squeeze a currency amount off-screen; amounts now always stay fully visible, with long labels truncating or wrapping instead.
- Made the "Currency mix" check on the Grow tab reflect real CNY exposure instead of always showing "good", and replaced the yield commentary's fixed calendar-date market snapshot with evergreen guidance so it doesn't read as stale over time — the personalized numbers (blended yield, real return, savings rate, etc.) already recalculate live from your data.

## Security notes

- Never commit a Supabase `service_role` key, database password, or personal access token.
- The Supabase publishable key is intended for browser use; Row Level Security protects each user's cloud data.
- Use a strong personal password when registering.

## License

Private project — all rights reserved.
