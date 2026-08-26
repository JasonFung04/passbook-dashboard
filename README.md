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
- Traditional Chinese / English interface switch
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

## Security notes

- Never commit a Supabase `service_role` key, database password, or personal access token.
- The Supabase publishable key is intended for browser use; Row Level Security protects each user's cloud data.
- Use a strong personal password when registering.

## License

Private project — all rights reserved.
