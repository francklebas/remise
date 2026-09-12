<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowRight, Mail } from "@lucide/vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const mode = ref<"signIn" | "signUp">("signIn");
const email = ref("");
const password = ref("");
const isSending = ref(false);
const captchaToken = ref("");
const captchaError = ref<string | null>(null);
const turnstileContainer = ref<HTMLElement | null>(null);
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let turnstileWidgetId: string | number | undefined;
let turnstileMountInterval: number | undefined;
const turnstileScriptSrc =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

function mountTurnstile() {
  if (
    !window.turnstile ||
    !turnstileContainer.value ||
    !turnstileSiteKey ||
    turnstileWidgetId !== undefined
  )
    return;
  turnstileWidgetId = window.turnstile.render(turnstileContainer.value, {
    sitekey: turnstileSiteKey,
    theme: "light",
    action: "password_auth",
    callback: (token) => {
      captchaToken.value = token;
      captchaError.value = null;
    },
    "expired-callback": () => {
      captchaToken.value = "";
    },
    "error-callback": () => {
      captchaToken.value = "";
      captchaError.value = "La vérification anti-robot a échoué. Réessayez.";
    },
  });
}

onMounted(() => {
  if (!turnstileSiteKey) return;
  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${turnstileScriptSrc}"]`,
  );
  if (existingScript)
    existingScript.addEventListener("load", mountTurnstile, { once: true });
  else {
    const script = document.createElement("script");
    script.src = turnstileScriptSrc;
    script.async = true;
    script.defer = true;
    script.onload = mountTurnstile;
    document.head.appendChild(script);
  }
  turnstileMountInterval = window.setInterval(() => {
    mountTurnstile();
    if (
      turnstileWidgetId !== undefined &&
      turnstileMountInterval !== undefined
    ) {
      window.clearInterval(turnstileMountInterval);
      turnstileMountInterval = undefined;
    }
  }, 100);
});
onBeforeUnmount(() => {
  if (turnstileMountInterval !== undefined)
    window.clearInterval(turnstileMountInterval);
});

async function submit() {
  if (!email.value.trim() || !password.value) return;
  if (turnstileSiteKey && !captchaToken.value) {
    captchaError.value =
      "Validez la vérification anti-robot avant de continuer.";
    return;
  }
  isSending.value = true;
  if (mode.value === "signIn")
    await auth.signInWithPassword(
      email.value.trim(),
      password.value,
      captchaToken.value || undefined,
    );
  else
    await auth.signUp(
      email.value.trim(),
      password.value,
      captchaToken.value || undefined,
    );
  isSending.value = false;
  if (turnstileWidgetId !== undefined) {
    window.turnstile?.reset(turnstileWidgetId);
    captchaToken.value = "";
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-base-200 px-5 py-8">
    <section
      class="w-full max-w-md rounded-3xl border border-base-300 bg-base-100 p-8 shadow-xl"
    >
      <div class="mb-7 flex items-center gap-3">
        <div
          class="grid size-11 place-items-center rounded-xl bg-primary text-primary-content"
        >
          <Mail :size="21" />
        </div>
        <div>
          <p class="text-xl font-black">Boardly</p>
          <p class="text-xs text-base-content/50">
            Vos boards, au même endroit
          </p>
        </div>
      </div>
      <p
        class="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"
      >
        Bienvenue
      </p>
      <h1 class="text-3xl font-black leading-tight tracking-tight">
        Accédez à vos boards
      </h1>
      <p class="mt-3 max-w-sm text-sm leading-relaxed text-base-content/60">
        Connectez-vous avec votre adresse e-mail et votre mot de passe.
      </p>
      <div role="tablist" class="tabs tabs-box mt-6 grid grid-cols-2">
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab-active': mode === 'signIn' }"
          @click="mode = 'signIn'"
        >
          Connexion
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab-active': mode === 'signUp' }"
          @click="mode = 'signUp'"
        >
          Créer un compte
        </button>
      </div>
      <form class="mt-7 flex flex-col gap-5" @submit.prevent="submit">
        <label class="form-control w-full">
          <span
            class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55"
            >Adresse e-mail</span
          >
          <input
            v-model="email"
            required
            type="email"
            autocomplete="email"
            placeholder="vous@exemple.fr"
            class="input input-bordered w-full"
          />
        </label>
        <label class="form-control w-full">
          <span
            class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55"
            >Mot de passe</span
          >
          <input
            v-model="password"
            required
            type="password"
            :autocomplete="
              mode === 'signIn' ? 'current-password' : 'new-password'
            "
            :minlength="mode === 'signUp' ? 8 : undefined"
            placeholder="8 caractères minimum"
            class="input input-bordered w-full"
          />
        </label>
        <div
          ref="turnstileContainer"
          class="flex min-h-[65px] justify-start overflow-hidden"
          aria-label="Contrôle anti-robot"
        ></div>
        <p v-if="captchaError" class="-mt-2 text-sm text-error">
          {{ captchaError }}
        </p>
        <button
          class="btn btn-primary w-full gap-2"
          :disabled="isSending || Boolean(turnstileSiteKey && !captchaToken)"
        >
          <span
            v-if="isSending"
            class="loading loading-spinner loading-sm"
          ></span>
          <template v-else>
            {{ mode === "signIn" ? "Se connecter" : "Créer mon compte" }}
            <ArrowRight :size="17" />
          </template>
        </button>
      </form>
      <div
        v-if="auth.confirmationSent"
        class="alert alert-success mt-6 text-sm leading-relaxed"
      >
        Votre compte a été créé. Consultez votre messagerie pour confirmer votre
        adresse, puis connectez-vous avec votre mot de passe.
      </div>
      <div
        v-if="auth.error"
        class="alert alert-error mt-6 text-sm leading-relaxed"
      >
        {{ auth.error }}
      </div>
    </section>
  </main>
</template>
