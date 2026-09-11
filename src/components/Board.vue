<script lang="ts" setup>
import Column from "@/components/Column.vue";
import { useBoardStore } from "@/stores/board.ts";

const store = useBoardStore();
</script>

<template>
  <div id="board" class="">
    <Column v-for="col of store.columns" :key="col.id" :col="col" />
  </div>
</template>
