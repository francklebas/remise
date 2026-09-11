# Boardly

Boardly is a lightweight Kanban workspace for organizing tasks visually. A workspace can contain several boards, and each board is made of reusable columns and cards. Cards can be edited from their modal, reordered, moved between columns, and enriched with a due date, estimated duration, complexity, and description.

## Using the app

1. Sign in with your email using the magic link.
2. Open a workspace and select a board.
3. Create or move cards across columns with drag and drop.
4. Double-click a card to edit its details in the modal.
5. Use the user menu to manage account data and notification preferences.

When task notifications are enabled, Boardly sends an email containing the task details and a direct link to the card.

## Progressive Web App

Boardly is installable as a Progressive Web App. Open the production site in a supported browser and choose **Install Boardly** from the browser menu. The service worker caches the application shell so the interface can open during a temporary network interruption; Supabase data still requires a connection.

## Local development

The application uses Vue 3, TypeScript, Vite, Pinia, Tailwind CSS, daisyUI, and Supabase.

```sh
bun install
cp .env.development.example .env.development.local
bun run dev
```

Fill in the Supabase and Turnstile values in `.env.development.local`. The local application is served at `http://localhost:5173`.

## Production builds

Production values are kept separate from local values:

```sh
cp .env.production.example .env.production.local
bun run build:production
```

The production application URL is `https://boardly.francklebas.com`. Authentication links use the current application origin automatically: `http://localhost:5173` locally and the production domain when deployed. `VITE_APP_URL` remains available for other production configuration, but login redirects do not depend on it.

All `*.local` files are ignored by Git. Never expose private keys through a variable prefixed with `VITE_`.

## Supabase notifications

Notifications are sent by the `send-task-notification` Supabase Edge Function. Resend credentials must be configured as Supabase secrets, not browser environment variables:

```sh
supabase secrets set RESEND_API_KEY="$RESEND_API_KEY" RESEND_FROM_EMAIL="Boardly <notifications@your-verified-domain.example>" APP_URL="https://boardly.francklebas.com"
supabase functions deploy send-task-notification
```

The sender domain must be verified in Resend, and Supabase Auth must have Turnstile enabled with its private secret key.
