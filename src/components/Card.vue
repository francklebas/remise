<script lang="ts" setup>
import { computed, ref } from "vue";
import { CalendarDays, MoreHorizontal, Trash2 } from "@lucide/vue";
import type { Card, CardComplexity, CardSaveStatus } from "@/types/board";
import ContentEditor from "@/components/ContentEditor.vue";
import { descriptionToPlainText, type CardDescription } from "@/editor/document";

interface CardProps {
  card: Card;
  saveStatus: CardSaveStatus;
}

export interface CardUpdateEvent {
  id: string;
  patch: Partial<Pick<Card, "title" | "description" | "dueDate" | "dueTime" | "estimatedDuration" | "complexity">>;
  notify?: boolean;
}

const props = defineProps<CardProps>();
const emit = defineEmits<{
  update: [event: CardUpdateEvent];
  remove: [id: string];
  dragStart: [id: string];
  dragEnd: [];
  flush: [id: string];
  retry: [id: string];
}>();

const title = ref(props.card.title);
const description = ref<CardDescription>(props.card.description);
const dueDate = ref<string | null>(props.card.dueDate);
const dueTime = ref<string | null>(props.card.dueTime);
const estimatedDuration = ref<number | null>(props.card.estimatedDuration);
const complexity = ref<CardComplexity>(props.card.complexity);
const editorDialog = ref<HTMLDialogElement>();
const descriptionPreview = computed(() => descriptionToPlainText(props.card.description));

function openEditor() {
  title.value = props.card.title;
  description.value = props.card.description;
  dueDate.value = props.card.dueDate;
  dueTime.value = props.card.dueTime;
  estimatedDuration.value = props.card.estimatedDuration;
  complexity.value = props.card.complexity;
  editorDialog.value?.showModal();
}

function closeEditor() {
  emit("flush", props.card.id);
  editorDialog.value?.close();
}

function updateDescription(value: CardDescription) {
  description.value = value;
  emit("update", { id: props.card.id, patch: { description: value } });
}

function updateTitle() {
  emit("update", { id: props.card.id, patch: { title: title.value.trim() || "Nouvelle tâche" } });
}

function save() {
  emit("update", {
    id: props.card.id,
    patch: {
      title: title.value.trim() || "Nouvelle tâche",
      description: description.value,
      dueDate: dueDate.value || null,
      dueTime: dueDate.value ? dueTime.value || null : null,
      estimatedDuration: estimatedDuration.value && estimatedDuration.value > 0 ? estimatedDuration.value : null,
      complexity: complexity.value,
    },
    notify: true,
  });
  closeEditor();
}
</script>

<template>
  <article draggable="true" class="card cursor-grab select-none border border-base-300 bg-base-100 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-base-100 hover:shadow-lg active:cursor-grabbing" :id="props.card.id" @dblclick="openEditor" @dragstart="emit('dragStart', props.card.id)" @dragend="emit('dragEnd')">
    <div class="card-body gap-2 p-4">
      <div class="flex items-start gap-2">
        <h3 class="min-w-0 flex-1 break-words text-sm font-bold leading-snug">{{ props.card.title || "Nouvelle tâche" }}</h3>
        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-circle btn-ghost btn-xs text-base-content/45" aria-label="Options de la carte"><MoreHorizontal :size="16" /></button>
          <ul tabindex="0" class="menu dropdown-content z-10 mt-1 w-40 rounded-box bg-base-100 p-2 text-sm shadow-xl">
            <li><button class="text-error" @click="emit('remove', props.card.id)"><Trash2 :size="15" /> Supprimer</button></li>
          </ul>
        </div>
      </div>
      <p class="min-h-8 whitespace-pre-line break-words text-xs leading-relaxed text-base-content/55">{{ descriptionPreview || "Ajouter une description" }}</p>
      <div class="mt-1 flex items-center justify-between text-[11px] font-semibold text-base-content/35">
        <span class="rounded-md px-2 py-1" :class="{ 'bg-success/20 text-success-content': props.card.complexity === 'low', 'bg-warning/25 text-warning-content': props.card.complexity === 'medium', 'bg-error/20 text-error-content': props.card.complexity === 'high' }">{{ props.card.complexity === "low" ? "FAIBLE" : props.card.complexity === "high" ? "ÉLEVÉE" : "MOYENNE" }}</span>
        <span v-if="props.card.dueDate" class="flex items-center gap-1"><CalendarDays :size="13" />{{ props.card.dueDate }}<template v-if="props.card.dueTime"> · {{ props.card.dueTime }}</template></span>
        <span v-else>À l'instant</span>
      </div>
    </div>
  </article>
  <dialog ref="editorDialog" class="modal" aria-labelledby="card-editor-title">
    <div class="modal-box w-11/12 max-w-5xl border border-base-300 bg-base-100 p-6 shadow-2xl">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-primary">Édition de la tâche</p>
          <h2 id="card-editor-title" class="mt-1 text-xl font-black">Modifier la carte</h2>
        </div>
        <form method="dialog">
          <button class="btn btn-circle btn-ghost btn-sm" aria-label="Fermer" @click="closeEditor">×</button>
        </form>
      </div>
      <label class="form-control mb-4 w-full">
        <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Titre</span>
        <input v-model="title" class="input input-bordered w-full font-semibold" autofocus @input="updateTitle" @keyup.esc="closeEditor" @keyup.ctrl.enter="save" />
      </label>
      <div class="form-control w-full">
        <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Description</span>
        <ContentEditor :model-value="description" :card-id="props.card.id" @update:model-value="updateDescription" />
        <div class="mt-2 flex min-h-5 items-center gap-2 text-xs text-base-content/50" aria-live="polite">
          <span v-if="saveStatus === 'saving'">Enregistrement…</span>
          <template v-else-if="saveStatus === 'error'"><span class="text-error">Modifications non enregistrées.</span><button class="link link-error" type="button" @click="emit('retry', props.card.id)">Réessayer</button></template>
        </div>
      </div>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="form-control w-full">
          <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Date de création</span>
          <input type="date" class="input input-bordered w-full bg-base-200 text-base-content/60" :value="props.card.createdAt" readonly aria-readonly="true" />
        </label>
        <label class="form-control w-full">
          <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Date limite</span>
          <input v-model="dueDate" type="date" class="input input-bordered w-full" @keyup.esc="closeEditor" />
        </label>
        <label class="form-control w-full">
          <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Heure limite</span>
          <input v-model="dueTime" type="time" class="input input-bordered w-full" :disabled="!dueDate" @keyup.esc="closeEditor" />
        </label>
      </div>
      <label class="form-control mt-4 w-full sm:max-w-[calc(50%-0.5rem)]">
        <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Durée estimée</span>
        <div class="join w-full">
          <input v-model.number="estimatedDuration" type="number" min="0" step="15" class="input input-bordered join-item w-full" placeholder="0" @keyup.esc="closeEditor" />
          <span class="btn btn-neutral join-item pointer-events-none">min</span>
        </div>
      </label>
      <label class="form-control mt-4 w-full sm:max-w-[calc(50%-0.5rem)]">
        <span class="label-text mb-2 text-xs font-bold uppercase tracking-wide text-base-content/55">Complexité</span>
        <select v-model="complexity" class="select select-bordered w-full">
          <option value="low">Faible</option>
          <option value="medium">Moyenne</option>
          <option value="high">Élevée</option>
        </select>
      </label>
      <div class="modal-action">
        <button class="btn btn-ghost" @click="closeEditor">Annuler</button>
        <button class="btn btn-primary" @click="save">Enregistrer</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button aria-label="Fermer l’éditeur" @click="closeEditor">Fermer</button>
    </form>
  </dialog>
</template>
