<script lang="ts" setup>
import type { Card } from "@/types/board";

const props = defineProps<Card>();

const placeholder = "Define a title";
</script>

<template>
  <div :id="props.id">{{ props.title || placeholder }}</div>
</template>
