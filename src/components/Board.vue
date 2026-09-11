<script lang="ts" setup>
import { computed, nextTick, onMounted, ref } from "vue";
import Column from "@/components/Column.vue";
import { useBoardStore } from "@/stores/board";

const store = useBoardStore();
const draggedCardId = ref<string | null>(null);
const sourceColumnId = ref<string | null>(null);
const cardCount = computed(() => store.columns.reduce((total, column) => total + column.cards.length, 0));

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
  const cardId = new URLSearchParams(window.location.search).get("card");
  if (cardId) void nextTick(() => document.getElementById(cardId)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }));
});
</script>

<template>
  <div class="mb-7 flex items-end justify-between gap-4">
    <div>
      <p class="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-primary"><span class="size-2 rounded-full bg-primary"></span>{{ store.activeWorkspace.name }}</p>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">Mon espace de travail</h1>
      <p class="mt-2 text-sm text-base-content/55">Organisez vos idées, une tâche à la fois.</p>
    </div>
    <div class="hidden items-center gap-2 text-sm font-semibold text-base-content/50 sm:flex">
      <span class="size-2 rounded-full bg-success"></span>{{ cardCount }} tâches
    </div>
  </div>
  <div id="board" class="flex items-start gap-5 overflow-x-auto pb-5">
    <Column
      v-for="column in store.columns"
      :key="column.id"
      :column="column"
      :dragged-card-id="draggedCardId"
      @drag-start="startDragging($event, column.id)"
      @drag-end="stopDragging"
      @drop="dropCard(column.id, $event)"
    />
    <button class="btn btn-ghost min-w-72 border border-dashed border-base-content/20 bg-base-100/50" @click="store.addColumn">
      <span class="text-xl">+</span> Ajouter une colonne
    </button>
  </div>
</template>
