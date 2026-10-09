<script lang="ts" setup>
import { legalLinks } from "@/legal";
import { navigate } from "@/router";
</script>

<template>
  <footer class="mx-auto flex max-w-[1600px] flex-wrap gap-x-5 gap-y-2 px-5 pb-6 text-xs text-base-content/50 sm:px-8">
    <span>Remise</span>
    <a v-for="link in legalLinks" :key="link.path" :href="link.path" class="link link-hover" @click.prevent="navigate(link.path)">{{ link.label }}</a>
  </footer>
</template>
