<script lang="ts" setup>
import { ref } from "vue";
import { MoreHorizontal, Plus, Trash2 } from "@lucide/vue";
import Card, { type CardUpdateEvent } from "@/components/Card.vue";
import type { Column } from "@/types/board";
import { useBoardStore } from "@/stores/board";

const store = useBoardStore();

const props = defineProps<{ column: Column; draggedCardId: string | null }>();
const emit = defineEmits<{
  dragStart: [cardId: string];
  dragEnd: [];
  drop: [targetIndex: number];
}>();

const isOpen = ref(false);
const dragOverIndex = ref<number | null>(null);

const toggle = () => (isOpen.value = !isOpen.value);

const updateColumn = (e: Event) => {
  store.updateColumn(props.column.id, (e.target as HTMLInputElement).value);
};

const updateCard = (event: CardUpdateEvent) => {
  store.updateCard(props.column.id, event.id, event.patch);
};

const removeCard = (cardId: string) => {
  store.removeCard(props.column.id, cardId);
};

const setDragOver = (index: number) => {
  if (props.draggedCardId) dragOverIndex.value = index;
};

const dropAt = (index: number) => {
  if (props.draggedCardId) emit("drop", index);
  dragOverIndex.value = null;
};

const clearDragOver = () => {
  dragOverIndex.value = null;
};
</script>

<template>
  <section class="column flex w-72 min-w-72 flex-col gap-3" :id="props.column.id">
    <header class="flex items-center justify-between gap-2 px-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="size-2.5 shrink-0 rounded-full bg-primary"></span>
        <h2 @click="toggle" v-if="!isOpen" class="truncate text-sm font-black uppercase tracking-wide">
          {{ props.column.title }}
        </h2>
        <input v-else autofocus class="input input-xs min-w-0 max-w-40 font-bold" :value="props.column.title" @change="updateColumn" @blur="toggle" @keyup.enter="toggle" />
        <span class="badge badge-sm border-0 bg-base-300 font-bold">{{ props.column.cards.length }}</span>
      </div>
      <div class="dropdown dropdown-end">
        <button tabindex="0" class="btn btn-circle btn-ghost btn-xs" aria-label="Options de la colonne"><MoreHorizontal :size="17" /></button>
        <ul tabindex="0" class="menu dropdown-content z-10 mt-1 w-44 rounded-box bg-base-100 p-2 text-sm shadow-xl">
          <li><button class="text-error" @click="store.removeColumn(props.column.id)"><Trash2 :size="15" /> Supprimer</button></li>
        </ul>
      </div>
    </header>
    <div class="flex min-h-28 flex-col gap-3 rounded-2xl bg-base-300/55 p-3" @dragover.prevent="setDragOver(props.column.cards.length)" @drop="dropAt(props.column.cards.length)" @dragleave.self="clearDragOver">
      <div v-for="(card, index) in props.column.cards" :key="card.id" class="rounded-xl border-2 border-transparent transition-colors" :class="{ 'border-primary/60 bg-primary/10': dragOverIndex === index && draggedCardId !== card.id }" @dragover.prevent.stop="setDragOver(index)" @drop.prevent.stop="dropAt(index)">
        <Card :card="card" @update="updateCard" @remove="removeCard" @drag-start="emit('dragStart', $event)" @drag-end="emit('dragEnd')" />
      </div>
      <button class="btn btn-ghost btn-sm justify-start gap-2 text-base-content/55" @click="store.addCard(props.column.id)">
        <Plus :size="16" /> Ajouter une carte
      </button>
    </div>
  </section>
</template>
