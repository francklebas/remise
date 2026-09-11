<script lang="ts" setup>
import { ref } from "vue";
import { MoreHorizontal, Trash2 } from "@lucide/vue";
import type { Card } from "@/types/board";

interface CardProps {
  card: Card;
}

export interface CardUpdateEvent {
  id: string;
  patch: Partial<Pick<Card, "title" | "description">>;
}

const props = defineProps<CardProps>();
const emit = defineEmits<{
  update: [event: CardUpdateEvent];
  remove: [id: string];
  dragStart: [id: string];
  dragEnd: [];
}>();

const title = ref(props.card.title);
const description = ref(props.card.description);
const isEditing = ref(false);

function openEditor() {
  title.value = props.card.title;
  description.value = props.card.description;
  isEditing.value = true;
}

function closeEditor() {
  isEditing.value = false;
}

function save() {
  emit("update", {
    id: props.card.id,
    patch: { title: title.value.trim() || "Nouvelle tâche", description: description.value.trim() },
  });
  closeEditor();
}
</script>

<template>
  <article draggable="true" class="card cursor-grab border border-base-300 bg-base-100 shadow-sm transition-all hover:shadow-md active:cursor-grabbing" :id="props.card.id" @dblclick="openEditor" @dragstart="emit('dragStart', props.card.id)" @dragend="emit('dragEnd')">
    <div class="card-body gap-2 p-4">
      <div class="flex items-start gap-2">
        <input v-model="title" class="input input-ghost input-sm min-w-0 flex-1 px-0 text-sm font-bold focus:bg-base-200" aria-label="Titre de la carte" @blur="save" @keyup.enter="save" />
        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-circle btn-ghost btn-xs text-base-content/45" aria-label="Options de la carte"><MoreHorizontal :size="16" /></button>
          <ul tabindex="0" class="menu dropdown-content z-10 mt-1 w-40 rounded-box bg-base-100 p-2 text-sm shadow-xl">
            <li><button class="text-error" @click="emit('remove', props.card.id)"><Trash2 :size="15" /> Supprimer</button></li>
          </ul>
        </div>
      </div>
      <textarea v-model="description" rows="2" class="textarea textarea-ghost min-h-0 resize-none px-0 text-xs leading-relaxed text-base-content/55 focus:bg-base-200" placeholder="Ajouter une description" aria-label="Description de la carte" @blur="save" />
      <div class="mt-1 flex items-center justify-between text-[11px] font-semibold text-base-content/35">
        <span class="rounded-md bg-primary/15 px-2 py-1 text-primary-content/70">TÂCHE</span>
        <span>À l'instant</span>
      </div>
    </div>
  </article>
  <div v-if="isEditing" class="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="card-editor-title" @click.self="closeEditor">
    <div class="modal-box max-w-lg border border-base-300 bg-base-100 p-6 shadow-2xl">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-primary">Édition de la tâche</p>
          <h2 id="card-editor-title" class="mt-1 text-xl font-black">Modifier la carte</h2>
        </div>
        <button class="btn btn-circle btn-ghost btn-sm" aria-label="Fermer" @click="closeEditor">×</button>
      </div>
      <label class="form-control mb-4 w-full">
        <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Titre</span>
        <input v-model="title" class="input input-bordered w-full font-semibold" autofocus @keyup.esc="closeEditor" @keyup.ctrl.enter="save" />
      </label>
      <label class="form-control w-full">
        <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Description</span>
        <textarea v-model="description" class="textarea textarea-bordered min-h-32 w-full leading-relaxed" placeholder="Ajouter une description" @keyup.esc="closeEditor" />
      </label>
      <div class="modal-action">
        <button class="btn btn-ghost" @click="closeEditor">Annuler</button>
        <button class="btn btn-primary" @click="save">Enregistrer</button>
      </div>
    </div>
  </div>
</template>
