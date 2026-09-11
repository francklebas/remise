<script lang="ts" setup>
import { useBoardStore } from "@/stores/board";
import { Check, ChevronDown, LayoutDashboard, LogOut, Plus, Search, Sparkles, UserRound } from "@lucide/vue";
import { useAuthStore } from "@/stores/auth";
import { navigate } from "@/router";

const store = useBoardStore();
const auth = useAuthStore();
</script>

<template>
  <header class="border-b border-base-300 bg-base-100">
    <div class="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
      <div class="flex items-center gap-3">
        <div class="grid size-10 place-items-center rounded-xl bg-primary text-primary-content shadow-sm">
          <LayoutDashboard :size="20" :stroke-width="2.5" />
        </div>
        <div class="dropdown dropdown-start">
          <button tabindex="0" class="group flex items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-base-200">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/45">Mes espaces</p>
              <p class="flex items-center gap-1 text-sm font-black tracking-tight">{{ store.activeWorkspace.name }} <ChevronDown :size="15" class="text-base-content/45 transition-transform group-focus:rotate-180" /></p>
            </div>
          </button>
          <ul tabindex="0" class="menu dropdown-content z-20 mt-2 w-60 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl">
            <li class="menu-title px-3 pb-1 pt-2 text-[10px] uppercase tracking-wider">Espaces de travail</li>
            <li v-for="workspace in store.workspaces" :key="workspace.id">
              <button class="flex justify-between" @click="store.selectWorkspace(workspace.id)">
                <span class="flex items-center gap-2"><span class="size-2.5 rounded-full" :class="workspace.color"></span>{{ workspace.name }}</span>
                <Check v-if="workspace.id === store.activeWorkspaceId" :size="15" class="text-primary" />
              </button>
            </li>
            <li><button class="mt-1 border-t border-base-300 pt-3 text-primary"><Plus :size="15" /> Nouvel espace</button></li>
          </ul>
        </div>
      </div>
      <div class="flex items-center gap-2 sm:gap-3">
        <label class="input input-sm hidden w-52 items-center gap-2 bg-base-200 sm:flex">
          <Search :size="16" class="text-base-content/40" />
          <input v-model="store.searchQuery" type="search" placeholder="Rechercher…" aria-label="Rechercher dans les tâches" />
        </label>
        <button class="btn btn-primary btn-sm gap-2 rounded-lg" @click="store.addColumn">
          <Plus :size="17" />
          <span class="hidden sm:inline">Ajouter une colonne</span>
          <span class="sm:hidden">Ajouter</span>
        </button>
        <button class="btn btn-circle btn-ghost btn-sm" aria-label="Assistant">
          <Sparkles :size="18" />
        </button>
        <button class="btn btn-circle btn-ghost btn-sm" aria-label="Ouvrir mon espace utilisateur" title="Mon espace utilisateur" @click="navigate('/user')">
          <UserRound :size="18" />
        </button>
        <button class="btn btn-circle btn-ghost btn-sm" aria-label="Se déconnecter" title="Se déconnecter" @click="auth.signOut"><LogOut :size="18" /></button>
      </div>
    </div>
  </header>
</template>
