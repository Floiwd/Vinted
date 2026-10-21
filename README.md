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

Copy `.env.example` to `.env.local`. In Supabase, enable email/password authentication and run the SQL in `supabase/migrations/20261018_vinted_accounts.sql` from the SQL Editor. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must never use the `NEXT_PUBLIC_` prefix. Create accounts from the app's sign-up screen.

**Configuration de l'IA (pour l'analyse des photos et la rédaction des annonces)**

Le tableau de bord utilise un moteur IA hybride qui peut fonctionner entièrement dans le cloud (sur Vercel, mobile, etc.) ou en local (via OmniRoute). La configuration peut se faire de deux manières :

1.  **Via les variables d'environnement (recommandé pour Vercel/production)** :
    Définissez l'une des variables suivantes dans votre fichier `.env.local` (pour le développement local) ou dans les "Environment Variables" de votre projet Vercel (pour le déploiement). Si plusieurs sont définies, le système choisira le premier fournisseur disponible dans cet ordre :

    *   `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`) : Clé API pour Google Gemini Cloud. Obtenez une clé [ici sur Google AI Studio](https://aistudio.google.com/apikey). Idéal pour la vision et la rédaction.
    *   `OPENROUTER_API_KEY` : Clé API pour OpenRouter.ai, qui agrège de nombreux modèles (Gemini, Claude, Llama). Obtenez une clé [ici](https://openrouter.ai/keys).
    *   `OPENAI_API_KEY` : Clé API pour OpenAI (GPT-4o, GPT-4o-mini). Obtenez une clé [ici](https://platform.openai.com/api-keys).
    *   `GROQ_API_KEY` : Clé API pour Groq (modèles Llama ultra-rapides pour la vision et le texte). Obtenez une clé [ici](https://console.groq.com/keys).
    *   `ANTHROPIC_API_KEY` : Clé API pour Anthropic (modèles Claude). Obtenez une clé [ici](https://console.anthropic.com/settings/keys).
    *   `OMNIROUTE_BASE_URL` et `OMNIROUTE_API_KEY` : Utilisez si vous avez déployé un serveur OmniRoute publiquement (ex: via un tunnel Cloudflare/ngrok ou un VPS) ou si vous utilisez OmniRoute en local (`http://localhost:20128`).
        *   **Important** : Si l'application tourne sur un environnement cloud (comme Vercel) et que `OMNIROUTE_BASE_URL` pointe vers `localhost`, le système ignorera cette configuration et tentera d'utiliser un fournisseur cloud si disponible.

2.  **Via l'interface utilisateur (directement dans l'application)** :
    Après vous être connecté, un bouton "Moteur IA" sera disponible. Il vous permettra de configurer votre clé API (Gemini, OpenRouter, OpenAI, Groq, Anthropic) ou l'URL d'un serveur OmniRoute distant. Cette configuration sera sauvegardée sur votre compte Supabase, ce qui la rendra disponible sur tous vos appareils et déploiements sans nécessiter de redéploiement.

`STOCK_PIPELINE` est optionnel: ajoutez une URL `/exec` d'un script Google Apps déployé uniquement si vous souhaitez que les entrées générées soient copiées dans Google Sheets ; laissez-le vide pour n'utiliser que Supabase.

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
