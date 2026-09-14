<script setup lang="ts">
import { ref } from "vue";
import { ArrowRight, KeyRound } from "@lucide/vue";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/router";

const password = ref("");
const confirmation = ref("");
const isSaving = ref(false);
const error = ref<string | null>(null);
const completed = ref(false);

async function submit() {
  error.value = null;
  if (password.value.length < 8) { error.value = "Le mot de passe doit contenir au moins 8 caractères."; return; }
  if (password.value !== confirmation.value) { error.value = "Les mots de passe ne correspondent pas."; return; }
  if (!supabase) { error.value = "Service d’authentification indisponible."; return; }
  isSaving.value = true;
  const { error: updateError } = await supabase.auth.updateUser({ password: password.value });
  isSaving.value = false;
  if (updateError) error.value = updateError.message;
  else completed.value = true;
}

async function backToLogin() {
  await supabase?.auth.signOut();
  navigate("/");
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-base-200 px-5 py-8">
    <section class="w-full max-w-md rounded-3xl border border-base-300 bg-base-100 p-8 shadow-xl">
      <div class="mb-7 flex items-center gap-3"><div class="grid size-11 place-items-center rounded-xl bg-primary text-primary-content"><KeyRound :size="21" /></div><p class="text-xl font-black">Boardly</p></div>
      <h1 class="text-3xl font-black tracking-tight">Nouveau mot de passe</h1>
      <form v-if="!completed" class="mt-7 flex flex-col gap-5" @submit.prevent="submit">
        <label class="form-control"><span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Nouveau mot de passe</span><input v-model="password" required minlength="8" type="password" autocomplete="new-password" class="input input-bordered w-full" /></label>
        <label class="form-control"><span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Confirmation</span><input v-model="confirmation" required minlength="8" type="password" autocomplete="new-password" class="input input-bordered w-full" /></label>
        <button class="btn btn-primary w-full gap-2" :disabled="isSaving"><span v-if="isSaving" class="loading loading-spinner loading-sm" /><template v-else>Enregistrer <ArrowRight :size="17" /></template></button>
      </form>
      <div v-else class="alert alert-success mt-6 text-sm">Votre mot de passe a été mis à jour.</div>
      <p v-if="error" class="alert alert-error mt-6 text-sm">{{ error }}</p>
      <button v-if="completed" class="btn btn-ghost mt-5 w-full" type="button" @click="backToLogin">Retour à la connexion</button>
    </section>
  </main>
</template>
