<script lang="ts" setup>
const props = defineProps<{ col: { title: string; id: string } }>();
</script>

<template>
  <div class="" :id="props.id">
    <h2>{{ col.title }}</h2>
  </div>
</template>
