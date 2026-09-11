<script lang="ts" setup>
import { ref } from "vue";
import { MoreHorizontal, Trash2 } from "@lucide/vue";
import type { Card } from "@/types/board";

interface CardProps {
  card: Card;
}

export interface CardUpdateEvent {
  id: string;
  patch: Partial<Pick<Card, "title" | "description">>;
}

const props = defineProps<CardProps>();
const emit = defineEmits<{
  update: [event: CardUpdateEvent];
  remove: [id: string];
}>();

const title = ref(props.card.title);
const description = ref(props.card.description);

function save() {
  emit("update", {
    id: props.card.id,
    patch: { title: title.value.trim() || "Nouvelle tâche", description: description.value.trim() },
  });
}
</script>

<template>
  <article class="card border border-base-300 bg-base-100 shadow-sm transition-shadow hover:shadow-md" :id="props.card.id">
    <div class="card-body gap-2 p-4">
      <div class="flex items-start gap-2">
        <input v-model="title" class="input input-ghost input-sm min-w-0 flex-1 px-0 text-sm font-bold focus:bg-base-200" aria-label="Titre de la carte" @blur="save" @keyup.enter="save" />
        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-circle btn-ghost btn-xs text-base-content/45" aria-label="Options de la carte"><MoreHorizontal :size="16" /></button>
          <ul tabindex="0" class="menu dropdown-content z-10 mt-1 w-40 rounded-box bg-base-100 p-2 text-sm shadow-xl">
            <li><button class="text-error" @click="emit('remove', props.card.id)"><Trash2 :size="15" /> Supprimer</button></li>
          </ul>
        </div>
      </div>
      <textarea v-model="description" rows="2" class="textarea textarea-ghost min-h-0 resize-none px-0 text-xs leading-relaxed text-base-content/55 focus:bg-base-200" placeholder="Ajouter une description" aria-label="Description de la carte" @blur="save" />
      <div class="mt-1 flex items-center justify-between text-[11px] font-semibold text-base-content/35">
        <span class="rounded-md bg-primary/15 px-2 py-1 text-primary-content/70">TÂCHE</span>
        <span>À l'instant</span>
      </div>
    </div>
  </article>
</template>
