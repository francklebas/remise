<script lang="ts" setup>
import { computed, nextTick, ref } from "vue";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2 } from "@lucide/vue";
import { useBoardStore } from "@/stores/board";
import { boardPath } from "@/router";
import type { BoardSummary } from "@/types/board";

const store = useBoardStore();
const activeBoards = computed(() => store.boards.filter((board) => !board.archivedAt));
const archivedBoards = computed(() => store.boards.filter((board) => board.archivedAt));
const isRenaming = ref(false);
const renameInput = ref<HTMLInputElement | null>(null);
const isCreating = ref(false);
const createInput = ref<HTMLInputElement | null>(null);

function openFromLink(event: MouseEvent, boardId: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  void store.openBoard(boardId);
}

async function startRenaming() {
  isRenaming.value = true;
  await nextTick();
  renameInput.value?.select();
}

function finishRenaming(event: Event) {
  if (!isRenaming.value) return;
  isRenaming.value = false;
  if (store.activeBoardId) void store.renameBoard(store.activeBoardId, (event.target as HTMLInputElement).value);
}

async function startCreating() {
  isCreating.value = true;
  await nextTick();
  createInput.value?.focus();
}

function finishCreating(event: Event) {
  if (!isCreating.value) return;
  isCreating.value = false;
  const name = (event.target as HTMLInputElement).value.trim();
  if (name) void store.createBoard(name);
}

function confirmDelete(board: BoardSummary) {
  if (window.confirm(`Supprimer définitivement le board « ${board.name} » et toutes ses cartes ?`)) void store.deleteBoard(board.id);
}
</script>

<template>
  <div class="mb-6 space-y-4">
    <nav class="flex flex-wrap items-center gap-2" aria-label="Boards de l’espace">
      <a
        v-for="board in activeBoards"
        :key="board.id"
        :href="boardPath(board.id)"
        class="btn btn-sm rounded-lg"
        :class="board.id === store.activeBoardId ? 'btn-primary' : 'btn-ghost bg-base-100/60'"
        :aria-current="board.id === store.activeBoardId ? 'page' : undefined"
        @click="openFromLink($event, board.id)"
      >{{ board.name }}</a>
      <input
        v-if="isCreating"
        ref="createInput"
        class="input input-sm w-48"
        placeholder="Nom du board"
        aria-label="Nom du nouveau board"
        @keyup.enter="finishCreating"
        @keyup.esc="isCreating = false"
        @blur="finishCreating"
      />
      <button v-else class="btn btn-ghost btn-sm gap-1 rounded-lg text-base-content/60" @click="startCreating"><Plus :size="15" /> Nouveau board</button>
      <div v-if="archivedBoards.length" class="dropdown dropdown-end ml-auto">
        <button tabindex="0" class="btn btn-ghost btn-sm gap-1 rounded-lg text-base-content/60"><Archive :size="15" /> Archivés ({{ archivedBoards.length }})</button>
        <ul tabindex="0" class="menu dropdown-content z-20 mt-1 w-72 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-xl">
          <li v-for="board in archivedBoards" :key="board.id" class="flex-row items-center">
            <a :href="boardPath(board.id)" class="min-w-0 flex-1 truncate" @click="openFromLink($event, board.id)">{{ board.name }}</a>
            <button class="btn btn-ghost btn-xs px-1" :aria-label="`Restaurer ${board.name}`" title="Restaurer" @click="store.restoreBoard(board.id)"><ArchiveRestore :size="15" /></button>
            <button class="btn btn-ghost btn-xs px-1 text-error" :aria-label="`Supprimer ${board.name}`" title="Supprimer" @click="confirmDelete(board)"><Trash2 :size="15" /></button>
          </li>
        </ul>
      </div>
    </nav>

    <div v-if="store.boardError" role="alert" class="alert alert-error py-2 text-sm"><span>{{ store.boardError }}</span></div>
    <div v-if="store.activeBoard?.archivedAt" role="status" class="alert alert-warning py-2 text-sm">
      <span>Ce board est archivé.</span>
      <button class="btn btn-sm" @click="store.restoreBoard(store.activeBoard.id)"><ArchiveRestore :size="15" /> Restaurer</button>
    </div>

    <div class="flex items-center gap-2">
      <input
        v-if="isRenaming"
        ref="renameInput"
        class="input input-lg min-w-0 max-w-xl text-2xl font-black tracking-tight"
        :value="store.activeBoard?.name"
        aria-label="Nom du board"
        @keyup.enter="finishRenaming"
        @keyup.esc="isRenaming = false"
        @blur="finishRenaming"
      />
      <h1 v-else class="truncate text-3xl font-black tracking-tight sm:text-4xl" @dblclick="startRenaming">{{ store.activeBoard?.name }}</h1>
      <div v-if="store.activeBoard" class="dropdown dropdown-end">
        <button tabindex="0" class="btn btn-circle btn-ghost btn-sm" aria-label="Options du board"><MoreHorizontal :size="18" /></button>
        <ul tabindex="0" class="menu dropdown-content z-20 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-xl">
          <li><button @click="startRenaming"><Pencil :size="15" /> Renommer</button></li>
          <li v-if="!store.activeBoard.archivedAt"><button @click="store.archiveBoard(store.activeBoard.id)"><Archive :size="15" /> Archiver</button></li>
          <li><button class="text-error" @click="confirmDelete(store.activeBoard)"><Trash2 :size="15" /> Supprimer</button></li>
        </ul>
      </div>
    </div>
  </div>
</template>
