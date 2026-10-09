<script lang="ts" setup>
import { computed, nextTick, ref } from "vue";
import { Check, Trash2 } from "@lucide/vue";
import { useBoardStore } from "@/stores/board";
import { workspaceColors } from "@/lib/workspace-colors";
import type { Workspace } from "@/types/board";

const store = useBoardStore();
const dialog = ref<HTMLDialogElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
const editing = ref<Workspace | null>(null);
const name = ref("");
const color = ref<string>(workspaceColors[0].id);
const isDeleting = ref(false);
const deleteConfirmation = ref("");
const isBusy = ref(false);
const canDelete = computed(() => editing.value && store.workspaces.length > 1);

async function open(workspace: Workspace | null = null) {
  editing.value = workspace;
  name.value = workspace?.name ?? "";
  color.value = workspace?.color ?? workspaceColors[0].id;
  isDeleting.value = false;
  deleteConfirmation.value = "";
  store.workspaceError = null;
  dialog.value?.showModal();
  await nextTick();
  nameInput.value?.focus();
}

async function save() {
  if (!name.value.trim() || isBusy.value) return;
  isBusy.value = true;
  const saved = editing.value
    ? await store.updateWorkspace(editing.value.id, { name: name.value, color: color.value })
    : await store.createWorkspace(name.value, color.value);
  isBusy.value = false;
  if (saved) dialog.value?.close();
}

async function remove() {
  if (!editing.value || deleteConfirmation.value !== editing.value.name || isBusy.value) return;
  isBusy.value = true;
  const deleted = await store.deleteWorkspace(editing.value.id);
  isBusy.value = false;
  if (deleted) dialog.value?.close();
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="modal" aria-labelledby="workspace-dialog-title">
    <div class="modal-box max-w-md border border-base-300 bg-base-100">
      <h2 id="workspace-dialog-title" class="text-xl font-black">{{ editing ? "Modifier l’espace" : "Nouvel espace" }}</h2>
      <form class="mt-5 space-y-5" @submit.prevent="save">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold">Nom</span>
          <input ref="nameInput" v-model="name" class="input input-bordered w-full" maxlength="60" required aria-label="Nom de l’espace" />
        </label>
        <fieldset>
          <legend class="mb-2 text-sm font-semibold">Couleur</legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in workspaceColors"
              :key="option.id"
              type="button"
              class="grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-base-100"
              :class="[option.className, { 'ring-2 ring-base-content': color === option.id }]"
              :aria-label="option.label"
              :aria-pressed="color === option.id"
              @click="color = option.id"
            ><Check v-if="color === option.id" :size="15" class="text-base-100" /></button>
          </div>
        </fieldset>
        <div v-if="store.workspaceError" role="alert" class="alert alert-error py-2 text-sm">{{ store.workspaceError }}</div>
        <div class="modal-action mt-0">
          <button type="button" class="btn btn-ghost" @click="dialog?.close()">Annuler</button>
          <button type="submit" class="btn btn-primary" :disabled="!name.trim() || isBusy">{{ editing ? "Enregistrer" : "Créer l’espace" }}</button>
        </div>
      </form>

      <section v-if="editing" class="mt-6 border-t border-base-300 pt-5">
        <button v-if="!isDeleting" type="button" class="btn btn-ghost btn-sm gap-2 text-error" :disabled="!canDelete" @click="isDeleting = true"><Trash2 :size="15" /> Supprimer l’espace</button>
        <p v-if="!canDelete" class="mt-1 text-xs text-base-content/55">Vous devez garder au moins un espace.</p>
        <form v-if="isDeleting" class="space-y-3" @submit.prevent="remove">
          <p class="text-sm">Tous les boards, cartes et images de <strong>{{ editing.name }}</strong> seront supprimés définitivement. Tapez le nom de l’espace pour confirmer.</p>
          <input v-model="deleteConfirmation" class="input input-bordered input-sm w-full" aria-label="Confirmer le nom de l’espace à supprimer" autocomplete="off" />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-ghost btn-sm" @click="isDeleting = false">Annuler</button>
            <button type="submit" class="btn btn-error btn-sm" :disabled="deleteConfirmation !== editing.name || isBusy">Supprimer définitivement</button>
          </div>
        </form>
      </section>
    </div>
    <form method="dialog" class="modal-backdrop"><button>Fermer</button></form>
  </dialog>
</template>
