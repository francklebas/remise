import { defineStore } from "pinia";
import { v4 } from "uuid";
import { computed, ref } from "vue";
import type { Card, Column, TaskNotificationAction, Workspace } from "@/types/board";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

export const useBoardStore = defineStore("board", () => {
  const auth = useAuthStore();
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
          createdAt: "2026-09-08",
          dueDate: "2026-09-18",
          dueTime: "17:00",
          estimatedDuration: 120,
          complexity: "high",
          columnId: "todo",
        },
        {
          id: v4(),
          title: "Préparer les contenus",
          description: "Rassembler les textes et visuels nécessaires.",
          createdAt: "2026-09-09",
          dueDate: null,
          dueTime: null,
          estimatedDuration: null,
          complexity: "medium",
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
          createdAt: "2026-09-07",
          dueDate: "2026-09-15",
          dueTime: "12:00",
          estimatedDuration: 90,
          complexity: "low",
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

    const card: Card = {
      id: v4(),
      title: "Nouvelle tâche",
      description: "",
      createdAt: new Date().toISOString().slice(0, 10),
      dueDate: null,
      dueTime: null,
      estimatedDuration: null,
      complexity: "medium",
      columnId,
    };
    column.cards.push(card);
    void sendTaskNotification(card, "created");
  }

  function updateCard(columnId: string, cardId: string, patch: Partial<Pick<Card, "title" | "description" | "dueDate" | "dueTime" | "estimatedDuration" | "complexity">>) {
    const column = columns.value.find((item) => item.id === columnId);
    const card = column?.cards.find((item) => item.id === cardId);
    if (card) {
      Object.assign(card, patch);
      void sendTaskNotification(card, "updated");
    }
  }

  async function sendTaskNotification(card: Card, action: TaskNotificationAction) {
    if (!supabase || !auth.notificationsEnabled) return;
    await supabase.functions.invoke("send-task-notification", {
      body: {
        action,
        task: {
          id: card.id,
          title: card.title,
          description: card.description,
          dueDate: card.dueDate,
          dueTime: card.dueTime,
          estimatedDuration: card.estimatedDuration,
          complexity: card.complexity,
        },
      },
    });
  }

  function removeCard(columnId: string, cardId: string) {
    const column = columns.value.find((item) => item.id === columnId);
    if (column) column.cards = column.cards.filter((card) => card.id !== cardId);
  }

  function moveCard(cardId: string, sourceColumnId: string, targetColumnId: string, targetIndex: number) {
    const sourceColumn = columns.value.find((column) => column.id === sourceColumnId);
    const targetColumn = columns.value.find((column) => column.id === targetColumnId);
    if (!sourceColumn || !targetColumn) return;

    const sourceIndex = sourceColumn.cards.findIndex((card) => card.id === cardId);
    if (sourceIndex < 0) return;

    const [card] = sourceColumn.cards.splice(sourceIndex, 1);
    if (!card) return;

    let insertionIndex = Math.max(0, Math.min(targetIndex, targetColumn.cards.length));
    if (sourceColumnId === targetColumnId && sourceIndex < insertionIndex) insertionIndex -= 1;

    card.columnId = targetColumnId;
    targetColumn.cards.splice(insertionIndex, 0, card);
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
    moveCard,
  };
});
