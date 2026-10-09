<script lang="ts" setup>
import { ref } from "vue";
import { ArrowLeft, Settings, UserRound } from "@lucide/vue";
import { boardPath, navigate } from "@/router";
import { useAuthStore } from "@/stores/auth";
import { useBoardStore } from "@/stores/board";

type UserTab = "profile" | "notifications" | "settings";

const auth = useAuthStore();
const board = useBoardStore();
const activeTab = ref<UserTab>("profile");

const isDeletingAccount = ref(false);
const deletePassword = ref("");
const isDeleting = ref(false);

function cancelAccountDeletion() {
  isDeletingAccount.value = false;
  deletePassword.value = "";
  auth.error = null;
}

async function deleteAccount() {
  isDeleting.value = true;
  const deleted = await auth.deleteAccount(deletePassword.value);
  isDeleting.value = false;
  if (deleted) navigate("/");
}

function goBack() {
  navigate(board.activeBoardId ? boardPath(board.activeBoardId) : "/");
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-5 pb-12 pt-8 sm:px-8">
    <button class="btn btn-ghost btn-sm mb-8 gap-2 pl-1" @click="goBack"><ArrowLeft :size="16" /> Retour au board</button>
    <div class="mb-8">
      <p class="mb-1 text-sm font-bold uppercase tracking-[0.18em] text-primary">Compte client</p>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">Mon espace utilisateur</h1>
      <p class="mt-2 text-sm text-base-content/55">Gérez vos informations et les préférences de votre application.</p>
    </div>

    <div role="tablist" class="tabs tabs-boxed mb-6 w-fit gap-1 bg-base-100 p-1">
      <button role="tab" class="tab gap-2" :class="{ 'tab-active': activeTab === 'profile' }" @click="activeTab = 'profile'">
        <UserRound :size="16" /> Données utilisateur
      </button>
      <button role="tab" class="tab gap-2" :class="{ 'tab-active': activeTab === 'settings' }" @click="activeTab = 'settings'">
        <Settings :size="16" /> Configuration
      </button>
      <button role="tab" class="tab gap-2" :class="{ 'tab-active': activeTab === 'notifications' }" @click="activeTab = 'notifications'">
        <span class="text-base">🔔</span> Notifications
      </button>
    </div>

    <section v-if="activeTab === 'profile'" class="space-y-4">
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
        <div class="mb-6 flex items-center gap-4">
          <div class="grid size-14 place-items-center rounded-full bg-primary text-lg font-black text-primary-content">{{ auth.session?.user.email?.charAt(0).toUpperCase() }}</div>
          <div><h2 class="font-black">Données utilisateur</h2><p class="text-sm text-base-content/55">Les informations associées à votre compte client.</p></div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-xl bg-base-200 p-4"><p class="text-xs font-bold uppercase tracking-wide text-base-content/45">Adresse e-mail</p><p class="mt-2 break-all font-semibold">{{ auth.session?.user.email }}</p></div>
          <div class="rounded-xl bg-base-200 p-4"><p class="text-xs font-bold uppercase tracking-wide text-base-content/45">Identifiant client</p><p class="mt-2 break-all font-mono text-xs font-semibold">{{ auth.session?.user.id }}</p></div>
        </div>
      </div>
      <div class="rounded-2xl border border-error/40 bg-base-100 p-6 shadow-sm">
        <h2 class="font-black text-error">Supprimer mon compte</h2>
        <p class="mt-1 text-sm text-base-content/65">Votre compte, vos espaces, boards, cartes et images seront supprimés définitivement. Cette action est irréversible.</p>
        <button v-if="!isDeletingAccount" class="btn btn-outline btn-error btn-sm mt-4" @click="isDeletingAccount = true">Supprimer mon compte…</button>
        <form v-else class="mt-4 space-y-3" @submit.prevent="deleteAccount">
          <label class="block">
            <span class="mb-1 block text-sm font-semibold">Confirmez avec votre mot de passe</span>
            <input v-model="deletePassword" type="password" autocomplete="current-password" class="input input-bordered w-full max-w-sm" aria-label="Mot de passe pour confirmer la suppression" required />
          </label>
          <div v-if="auth.error" role="alert" class="alert alert-error max-w-sm py-2 text-sm">{{ auth.error }}</div>
          <div class="flex gap-2">
            <button type="button" class="btn btn-ghost btn-sm" @click="cancelAccountDeletion">Annuler</button>
            <button type="submit" class="btn btn-error btn-sm" :disabled="!deletePassword || isDeleting"><span v-if="isDeleting" class="loading loading-spinner loading-xs" />Supprimer définitivement</button>
          </div>
        </form>
      </div>
    </section>

    <section v-else-if="activeTab === 'notifications'" class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
      <div class="mb-6 flex items-center gap-4"><div class="grid size-12 place-items-center rounded-xl bg-base-200 text-xl">🔔</div><div><h2 class="font-black">Notifications</h2><p class="text-sm text-base-content/55">Recevez un e-mail lorsqu’une tâche est créée ou modifiée.</p></div></div>
      <div class="flex items-center justify-between gap-5 rounded-xl border border-base-300 p-4"><div><p class="font-semibold">Recevoir les notifications sur mes tâches</p><p class="mt-1 text-sm text-base-content/55">Les messages seront envoyés à {{ auth.session?.user.email }}.</p></div><input v-model="auth.notificationsEnabled" type="checkbox" class="toggle toggle-primary" aria-label="Recevoir les notifications sur mes tâches" @change="auth.setNotificationsEnabled(auth.notificationsEnabled)" /></div>
      <div v-if="auth.error" class="alert alert-error mt-4 text-sm">{{ auth.error }}</div>
    </section>
    <section v-else class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
      <div class="mb-6 flex items-center gap-4"><div class="grid size-12 place-items-center rounded-xl bg-base-200"><Settings :size="21" /></div><div><h2 class="font-black">Configuration de l’application</h2><p class="text-sm text-base-content/55">Les préférences de Remise seront disponibles ici.</p></div></div>
      <div class="flex flex-col gap-3 rounded-xl border border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="font-semibold">Thème de l’application</p><p class="text-sm text-base-content/55">Choisissez le thème utilisé par Remise.</p></div><select :value="auth.themePreference" class="select select-bordered w-full sm:w-56" aria-label="Thème de l’application" @change="auth.setThemePreference(($event.target as HTMLSelectElement).value as 'dark' | 'light' | 'system')"><option value="system">Système</option><option value="light">Clair</option><option value="dark">Sombre</option></select></div>
      <div v-if="auth.error" class="alert alert-error mt-4 text-sm">{{ auth.error }}</div>
    </section>
  </main>
</template>
