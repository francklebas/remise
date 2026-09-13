# Boardly

Boardly is a lightweight Kanban workspace for organizing tasks visually. A workspace can contain several boards, and each board is made of reusable columns and cards. Cards can be edited from their modal, reordered, moved between columns, and enriched with a due date, estimated duration, complexity, and description.

## Using the app

1. Create an account with your email and password, confirm your email address, then sign in.
2. Open a workspace and select a board.
3. Create or move cards across columns with drag and drop.
4. Double-click a card to edit its details in the modal.
5. Use the user menu to manage account data and notification preferences.

When task notifications are enabled, Boardly sends an email containing the task details and a direct link to the card.

## Progressive Web App

Boardly is installable as a Progressive Web App. Open the production site in a supported browser and choose **Install Boardly** from the browser menu. The service worker caches the application shell so the interface can open during a temporary network interruption; Supabase data still requires a connection.

## Local development

The application uses Vue 3, TypeScript, Vite, Pinia, Tailwind CSS, daisyUI, and Supabase.

## Card content editor

Card descriptions use a single canonical ProseMirror JSON document. Existing plain-text descriptions are converted to this shape at the data-read boundary; the store and components only manipulate the JSON document afterwards. The **Rich Text** and **Markdown** tabs are two views of that same document: switching to Markdown serializes the current document, while switching back parses the edited Markdown and atomically replaces the ProseMirror state.

The schema supports paragraphs, headings, bold, italic, strike-through, links, inline code, blockquotes, ordered and unordered nested lists, and code blocks. A code block stores its language in `attrs.language`; aliases such as `sh` and `bash` are preserved exactly, including unknown languages. Code blocks use a fence longer than any backtick sequence in their content when serialized.

Markdown images are represented directly by their `src`, `alt`, and optional `title`, without upload or URL transformation. Horizontal separators are intentionally rejected for now because the current document schema cannot represent them. The Markdown buffer remains intact and the editor stays in Markdown mode when that happens, so no content is silently discarded. Syntax highlighting is not included yet: code blocks are visually distinct and retain their language, leaving highlighting as a presentation-only future addition.

Rich Text paste keeps ProseMirror’s native clipboard behavior: it prefers HTML, then falls back to plain text. Before ProseMirror parses HTML, Remise removes executable markup, tracking/style attributes and unsafe URLs while preserving supported semantic structure. HTML code blocks retain a `language-*` or `lang-*` class value as `code_block.attrs.language`; images remain external URLs and clipboard image files are not uploaded or converted to base64.

Documentary tables use the official ProseMirror table model: header cells and regular cells remain distinct, and the Rich Text editor supports native cell selection and Tab navigation. Markdown uses standard pipe tables. Because that format always treats its first row as headers, a Rich Text table without a header row, a table with headers outside its first row, or a cell containing multiple blocks cannot be converted to Markdown without loss; Remise keeps Rich Text active and reports that limitation instead of changing the document.

Pasting a single `http` or `https` URL into an empty Rich Text block creates a generic Rich Card. Pasting it into text creates an inline link instead, and pasting onto selected text applies a link to that selection. Rich Cards persist their URL and optional generic metadata; this version derives only a deterministic domain fallback because browser CORS prevents reliable generic metadata fetching and the project has no dedicated safe resolver. In Markdown, a card becomes `[Titre](URL)` when a title exists, otherwise the URL alone. Markdown never recreates a Rich Card automatically.

Rich Text can import `.txt`, `.md`, `.markdown`, `.html`, `.htm`, and `.docx` files through the import button, file drop, or a pasted file when the browser exposes it. Imports are immediately converted into the canonical ProseMirror document and inserted at the current selection; files are never attached. DOCX conversion uses Mammoth locally before the existing HTML sanitizer and parser. PDF, DOC, ODT, RTF, spreadsheet, and CSV imports are intentionally unsupported. Embedded DOCX images have no upload target and therefore degrade to their alternative text rather than being persisted as Data URLs.

Run the editor conversion tests with:

```sh
bun run test
```

```sh
bun install
bun run supabase:start
cp .env.development.example .env.development.local
bun run dev
```

Copy the local anon key printed by `bun run supabase:status` into `.env.development.local`. The local application is served at `http://localhost:5173`.

The local Supabase Docker stack includes Mailpit for capturing account-confirmation emails. Its web interface is available at `http://localhost:8025` and its SMTP port is `localhost:1025`.

Mailpit does not require mailboxes to be created beforehand. Use as many unique addresses under the reserved test domain `@example.test` as needed, for example:

```text
alice@example.test
bob@example.test
client-001@example.test
```

Every message sent to these addresses appears in the same Mailpit interface, and no message leaves the machine. Supabase requires a unique address per account. To reuse an address, delete its user first from **Authentication → Users** in the local Supabase Studio at `http://localhost:54323`.

Stop the local stack when it is no longer needed:

```sh
bun run supabase:stop
```

### End-to-end authentication test

With the local Supabase/Mailpit stack running, execute the complete account-creation, email-confirmation, sign-out, and password-login flow with:

```sh
bun run test:e2e
```

The test starts the Vite development server automatically, creates a unique `@example.test` account, reads its confirmation message through the Mailpit API, follows the confirmation link, and verifies a subsequent password login. Chromium must be available at `/usr/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to another executable when needed.

## Production builds

Production values are kept separate from local values:

```sh
cp .env.production.example .env.production.local
bun run build:production
```

The production application URL is `https://boardly.francklebas.com`. Account-confirmation links use the current application origin automatically: `http://localhost:5173` locally and the production domain when deployed. `VITE_APP_URL` remains available for other production configuration, but confirmation redirects do not depend on it.

All `*.local` files are ignored by Git. Never expose private keys through a variable prefixed with `VITE_`.

## Supabase notifications

Notifications are sent by the `send-task-notification` Supabase Edge Function. Resend credentials must be configured as Supabase secrets, not browser environment variables:

```sh
supabase secrets set RESEND_API_KEY="$RESEND_API_KEY" RESEND_FROM_EMAIL="Boardly <notifications@your-verified-domain.example>" APP_URL="https://boardly.francklebas.com"
supabase functions deploy send-task-notification
```

The sender domain must be verified in Resend, and Supabase Auth must have Turnstile enabled with its private secret key.
