<script lang="ts" setup>
import { computed, nextTick, onMounted, ref } from "vue";
import Column from "@/components/Column.vue";
import { useBoardStore } from "@/stores/board";
import { descriptionToPlainText } from "@/editor/document";

const store = useBoardStore();
const draggedCardId = ref<string | null>(null);
const sourceColumnId = ref<string | null>(null);
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
const visibleColumns = computed(() => {
  const query = normalize(store.searchQuery.trim());
  if (!query) return store.columns;

  return store.columns.map((column) => ({
    ...column,
    cards: column.cards.filter((card) => normalize(`${card.title} ${descriptionToPlainText(card.description)}`).includes(query)),
  }));
});
const totalCardCount = computed(() => store.columns.reduce((total, column) => total + column.cards.length, 0));
const visibleCardCount = computed(() => visibleColumns.value.reduce((total, column) => total + column.cards.length, 0));

const startDragging = (cardId: string, columnId: string) => {
  draggedCardId.value = cardId;
  sourceColumnId.value = columnId;
};

const stopDragging = () => {
  draggedCardId.value = null;
  sourceColumnId.value = null;
};

const dropCard = (targetColumnId: string, targetIndex: number) => {
  if (draggedCardId.value && sourceColumnId.value) {
    store.moveCard(draggedCardId.value, sourceColumnId.value, targetColumnId, targetIndex);
  }
  stopDragging();
};

onMounted(() => {
  void store.load();
  const cardId = new URLSearchParams(window.location.search).get("card");
  if (cardId) void nextTick(() => document.getElementById(cardId)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }));
});
</script>

<template>
  <div v-if="store.isLoading" class="grid min-h-72 place-items-center"><span class="loading loading-spinner loading-md text-primary" aria-label="Chargement des cartes" /></div>
  <div v-else-if="store.loadError" class="alert alert-error"><span>{{ store.loadError }}</span><button class="btn btn-sm" @click="store.load">Réessayer</button></div>
  <template v-else>
  <div class="mb-7 flex items-end justify-between gap-4">
    <div>
      <p class="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-primary"><span class="size-2 rounded-full bg-primary"></span>{{ store.activeWorkspace.name }}</p>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">Mon espace de travail</h1>
      <p class="mt-2 text-sm text-base-content/55">Organisez vos idées, une tâche à la fois.</p>
    </div>
    <div class="hidden items-center gap-2 text-sm font-semibold text-base-content/50 sm:flex">
      <span class="size-2 rounded-full bg-success"></span>{{ visibleCardCount }}<template v-if="store.searchQuery"> / {{ totalCardCount }}</template> tâches
    </div>
  </div>
  <div id="board" class="flex items-start gap-5 overflow-x-auto pb-5">
    <Column
      v-for="column in visibleColumns"
      :key="column.id"
      :column="column"
      :dragged-card-id="draggedCardId"
      @drag-start="startDragging($event, column.id)"
      @drag-end="stopDragging"
      @drop="dropCard(column.id, $event)"
    />
    <div v-if="store.searchQuery && visibleCardCount === 0" class="rounded-2xl border border-dashed border-base-content/20 bg-base-100/60 px-8 py-10 text-center">
      <p class="font-bold">Aucune tâche trouvée</p>
      <p class="mt-1 text-sm text-base-content/55">Essayez un autre titre ou mot-clé.</p>
    </div>
    <button class="btn btn-ghost min-w-72 border border-dashed border-base-content/20 bg-base-100/50" @click="store.addColumn">
      <span class="text-xl">+</span> Ajouter une colonne
    </button>
  </div>
  </template>
</template>
