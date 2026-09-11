<script lang="ts" setup>
import { ref } from "vue";
import { Plus } from "@lucide/vue";
import type { Column } from "@/types/board";
import { useBoardStore } from "@/stores/board";

const store = useBoardStore();

const props = defineProps<{ col: Column }>();

const isOpen = ref(false);

const toggle = () => (isOpen.value = !isOpen.value);

const placeholder = "Click to update";

const updateColumn = (e: { target: { value: any } }) =>
  console.log(props.col.id, e.target.value);
</script>

<template>
  <div class="column min-w-sm" :id="props.col.id">
    <header class="flex between">
      <h2 @click="toggle" v-if="!isOpen">
        {{ props.col.title || placeholder }}
      </h2>
      <input
        :value="props.col.title"
        :placeholder="props.col.title || placeholder"
        @change="updateColumn"
        v-else
      />
      <button class="btn" @click="store.addCard"><Plus /></button>
    </header>
    <Card v-for="card in props.col.cards" :key="card.id" />
  </div>
</template>
