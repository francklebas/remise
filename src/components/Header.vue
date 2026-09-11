<script lang="ts" setup>
import { useBoardStore } from "@/stores/board";

const { addColumn } = useBoardStore();
</script>

<template>
  <div class="flex flex-row justify-between">
    <img src="@/assets/vue.svg" />
    <button @click="addColumn" class="btn">Add column</button>
  </div>
</template>
