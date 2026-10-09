<script lang="ts" setup>
import { computed } from "vue";
import { ArrowLeft } from "@lucide/vue";
import { legalLinks, legalPages, type LegalRoute } from "@/legal";
import { navigate } from "@/router";

const props = defineProps<{ route: LegalRoute }>();
const page = computed(() => legalPages[props.route]);

function goBack() {
  if (window.history.length > 1) window.history.back();
  else navigate("/");
}
</script>

<template>
  <main class="min-h-screen bg-base-200 px-5 py-10 sm:px-8">
    <article class="mx-auto max-w-3xl rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm sm:p-10">
      <button class="btn btn-ghost btn-sm mb-6 gap-2 pl-1" @click="goBack"><ArrowLeft :size="16" /> Retour</button>
      <h1 class="text-3xl font-black tracking-tight">{{ page.title }}</h1>
      <div role="note" class="alert alert-warning mt-6 text-sm">Document provisoire : la version complète sera publiée avant l’ouverture des abonnements payants.</div>
      <section v-for="section in page.sections" :key="section.heading" class="mt-8">
        <h2 class="text-lg font-black">{{ section.heading }}</h2>
        <p v-for="paragraph in section.paragraphs" :key="paragraph" class="mt-2 leading-relaxed text-base-content/75">{{ paragraph }}</p>
      </section>
      <nav class="mt-10 flex flex-wrap gap-4 border-t border-base-300 pt-6 text-sm" aria-label="Informations légales">
        <a v-for="link in legalLinks" :key="link.path" :href="link.path" class="link" @click.prevent="navigate(link.path)">{{ link.label }}</a>
      </nav>
    </article>
  </main>
</template>
