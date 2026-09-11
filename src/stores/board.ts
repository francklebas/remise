import { defineStore } from "pinia";
import { v4 } from "uuid";
import { computed, ref } from "vue";
import type { Card, Column, Workspace } from "@/types/board";

export const useBoardStore = defineStore("board", () => {
  const workspaces: Workspace[] = [
    { id: "personal", name: "Personnel", color: "bg-primary" },
    { id: "studio", name: "Studio créatif", color: "bg-secondary" },
    { id: "team", name: "Équipe produit", color: "bg-info" },
  ];
  const activeWorkspaceId = ref("personal");
  const columns = ref<Column[]>([
    {
      id: "todo",
      title: "À faire",
      cards: [
        {
          id: v4(),
          title: "Structurer la page d'accueil",
          description: "Poser les bases de la nouvelle expérience.",
          columnId: "todo",
        },
        {
          id: v4(),
          title: "Préparer les contenus",
          description: "Rassembler les textes et visuels nécessaires.",
          columnId: "todo",
        },
      ],
    },
    {
      id: "doing",
      title: "En cours",
      cards: [
        {
          id: v4(),
          title: "Créer le système de design",
          description: "Définir les couleurs, espacements et composants.",
          columnId: "doing",
        },
      ],
    },
    { id: "done", title: "Terminé", cards: [] },
  ]);

  const activeWorkspace = computed(() => workspaces.find(({ id }) => id === activeWorkspaceId.value) ?? workspaces[0]);

  function addColumn() {
    columns.value.push({ id: v4(), title: "Nouvelle colonne", cards: [] });
  }

  function updateColumn(id: string, title: string) {
    columns.value = columns.value.map((col) =>
      col.id === id ? { ...col, title: title.trim() || "Sans titre" } : col,
    );
  }

  function removeColumn(id: string) {
    columns.value = columns.value.filter((column) => column.id !== id);
  }

  function addCard(columnId: string) {
    const column = columns.value.find((col) => col.id === columnId);

    if (!column) return;

    column.cards.push({
      id: v4(),
      title: "Nouvelle tâche",
      description: "",
      columnId,
    });
  }

  function updateCard(columnId: string, cardId: string, patch: Partial<Pick<Card, "title" | "description">>) {
    const column = columns.value.find((item) => item.id === columnId);
    const card = column?.cards.find((item) => item.id === cardId);
    if (card) Object.assign(card, patch);
  }

  function removeCard(columnId: string, cardId: string) {
    const column = columns.value.find((item) => item.id === columnId);
    if (column) column.cards = column.cards.filter((card) => card.id !== cardId);
  }

  function selectWorkspace(id: string) {
    if (workspaces.some((workspace) => workspace.id === id)) activeWorkspaceId.value = id;
  }

  return {
    columns,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    selectWorkspace,
    addColumn,
    updateColumn,
    removeColumn,
    addCard,
    updateCard,
    removeCard,
  };
});
