<script setup lang="ts">
import Board from "@/components/Board.vue";
import Header from "@/components/Header.vue";
</script>

<template>
  <div class="min-h-screen bg-base-200 text-base-content">
    <Header />
    <main class="mx-auto max-w-[1600px] px-5 pb-8 pt-6 sm:px-8">
      <Board />
    </main>
  </div>
</template>
