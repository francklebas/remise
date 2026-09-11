# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).
## Notifications Resend

Les notifications sont envoyées par la Supabase Edge Function `send-task-notification`. La clé Resend ne doit pas être préfixée par `VITE_` et ne doit jamais être exposée au navigateur.

## Protection Turnstile

Le formulaire de connexion utilise le widget Turnstile et transmet son token à Supabase Auth. Ajoutez `VITE_TURNSTILE_SITE_KEY` dans l’environnement de build, puis activez Turnstile dans Supabase dans **Authentication → Bot and Abuse Protection** avec la secret key Turnstile. La secret key ne doit jamais être ajoutée à une variable `VITE_`.

Configurez les secrets côté Supabase puis déployez la fonction :

```sh
supabase secrets set RESEND_API_KEY="$RESEND_API_KEY" RESEND_FROM_EMAIL="Boardly <notifications@votre-domaine-verifie.fr>" APP_URL="https://votre-app.fr"
supabase functions deploy send-task-notification
```

Le domaine utilisé dans `RESEND_FROM_EMAIL` doit être vérifié dans Resend. Le mail est envoyé à l’adresse du compte Supabase connecté et contient les informations de la tâche ainsi qu’un lien direct vers sa card.
