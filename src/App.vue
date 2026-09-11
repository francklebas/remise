<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import Board from "@/components/Board.vue";
import Header from "@/components/Header.vue";
import AuthPanel from "@/components/AuthPanel.vue";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

onMounted(() => auth.initialize());
onUnmounted(() => auth.dispose());
</script>

<template>
  <div v-if="!isSupabaseConfigured" class="grid min-h-screen place-items-center bg-base-200 px-5 text-center">
    <div class="alert alert-warning max-w-xl">Supabase n’est pas configuré. Copiez `.env.example` vers `.env.local`, puis renseignez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.</div>
  </div>
  <div v-else-if="auth.isLoading" class="grid min-h-screen place-items-center bg-base-200"><span class="loading loading-spinner loading-lg text-primary"></span></div>
  <AuthPanel v-else-if="!auth.session" />
  <div v-else class="min-h-screen bg-base-200 text-base-content">
    <Header />
    <main class="mx-auto max-w-[1600px] px-5 pb-8 pt-6 sm:px-8">
      <Board />
    </main>
  </div>
</template>
