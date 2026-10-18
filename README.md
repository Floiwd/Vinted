Vinted COO is a private inventory dashboard for sourcing, profitability checks, and preparing Vinted listings.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Configuration

Copy `.env.example` to `.env.local`. In Supabase, enable email/password authentication and run the SQL in `supabase/migrations/20261018_vinted_accounts.sql` from the SQL Editor. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must never use the `NEXT_PUBLIC_` prefix. Create accounts from the app's sign-up screen. Set `OMNIROUTE_API_KEY` and `OMNIROUTE_BASE_URL` for listing analysis. `STOCK_PIPELINE` is optional: add a deployed Google Apps Script `/exec` URL only if you also want generated entries copied to Google Sheets; leave it blank to use Supabase only.

At least three photos are required for analysis. The purchase price may be omitted and estimated by the vision model. The browser keeps a local cache and synchronizes inventory to the authenticated app server. By default, the server stores `stock.json`, its numeric SKU counter, and private purchase receipts under `.vinted-data/` (ignored by Git). Set `VINTED_DATA_DIR` to choose another persistent directory. Devices must use the same app server to share inventory; deployments with ephemeral filesystems need a persistent volume or an external database. Export a CSV for backups or enable Sheets synchronization with `STOCK_PIPELINE`.

The stock view supports physical shelf/bin locations, purchase and return dates, and private receipt uploads. The Labels view prints QR cards with a readable SKU, offers camera scanning, and crops a PDF's first page or an image to export the selected area as a 100 × 150 mm PDF. Use a secure context (HTTPS or localhost) for camera access.

Supabase Auth manages account creation, email/password sign-in, and persistent sessions. The API validates each access token server-side and scopes stock and receipt storage to the authenticated user.

## Checks

Run `npm run lint` and `npx tsc --noEmit` to check the code.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
