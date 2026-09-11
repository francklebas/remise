<script lang="ts" setup>
import { ref } from "vue";
import { ArrowRight, Mail } from "@lucide/vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const email = ref("");
const isSending = ref(false);

async function submit() {
  if (!email.value.trim()) return;
  isSending.value = true;
  await auth.signInWithMagicLink(email.value.trim());
  isSending.value = false;
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-base-200 px-5 py-8">
    <section class="w-full max-w-md rounded-3xl border border-base-300 bg-base-100 p-8 shadow-xl">
      <div class="mb-7 flex items-center gap-3">
        <div class="grid size-11 place-items-center rounded-xl bg-primary text-primary-content"><Mail :size="21" /></div>
        <div><p class="text-xl font-black">Boardly</p><p class="text-xs text-base-content/50">Vos boards, au même endroit</p></div>
      </div>
      <p class="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Bienvenue</p>
      <h1 class="text-3xl font-black leading-tight tracking-tight">Accédez à vos boards</h1>
      <p class="mt-3 max-w-sm text-sm leading-relaxed text-base-content/60">Connectez votre compte client pour retrouver vos espaces de travail.</p>
      <form class="mt-6 space-y-5" @submit.prevent="submit">
        <label class="form-control w-full">
          <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Adresse e-mail</span>
          <input v-model="email" required type="email" autocomplete="email" placeholder="vous@exemple.fr" class="input input-bordered w-full" />
        </label>
        <button class="btn btn-primary w-full gap-2" :disabled="isSending">
          <span v-if="isSending" class="loading loading-spinner loading-sm"></span>
          <template v-else>Recevoir mon lien de connexion <ArrowRight :size="17" /></template>
        </button>
      </form>
      <div v-if="auth.messageSent" class="alert alert-success mt-6 text-sm leading-relaxed">Un lien de connexion vient d’être envoyé à cette adresse.</div>
      <div v-if="auth.error" class="alert alert-error mt-6 text-sm leading-relaxed">{{ auth.error }}</div>
    </section>
  </main>
</template>
