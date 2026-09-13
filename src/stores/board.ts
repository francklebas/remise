import { defineStore } from "pinia";
import { v4 } from "uuid";
import { computed, ref } from "vue";
import type { Card, CardComplexity, CardSaveStatus, Column, TaskNotificationAction, Workspace } from "@/types/board";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { descriptionToPlainText, documentToJSON, emptyDocument, normalizeDescription } from "@/editor/document";

const saveDelay = 700;
const columnDefinitions: Array<Pick<Column, "id" | "title">> = [
  { id: "todo", title: "À faire" },
  { id: "doing", title: "En cours" },
  { id: "done", title: "Terminé" },
];

type CardRow = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: unknown;
  position: number;
  due_date: string | null;
  due_time: string | null;
  estimated_duration: number | null;
  complexity: CardComplexity;
  created_at: string;
};

type ColumnRow = { id: string; title: string; position: number };

function emptyColumns(): Column[] {
  return columnDefinitions.map((column) => ({ ...column, cards: [] }));
}

function fromRow(row: CardRow): Card {
  return {
    id: row.id,
    title: row.title,
    description: documentToJSON(normalizeDescription(row.description)),
    position: row.position,
    createdAt: row.created_at.slice(0, 10),
    dueDate: row.due_date,
    dueTime: row.due_time?.slice(0, 5) ?? null,
    estimatedDuration: row.estimated_duration,
    complexity: row.complexity,
    columnId: row.column_id,
  };
}

export const useBoardStore = defineStore("board", () => {
  const auth = useAuthStore();
  const workspaces: Workspace[] = [{ id: "personal", name: "Personnel", color: "bg-primary" }];
  const activeWorkspaceId = ref("personal");
  const searchQuery = ref("");
  const columns = ref<Column[]>(emptyColumns());
  const activeBoardId = ref<string | null>(null);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);
  const saveStates = ref<Record<string, CardSaveStatus>>({});
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const saveChains = new Map<string, Promise<void>>();
  const versions = new Map<string, number>();
  const unsavedCards = new Set<string>();
  const activeWorkspace = computed(() => workspaces.find(({ id }) => id === activeWorkspaceId.value) ?? workspaces[0]);

  function findCard(cardId: string) {
    for (const column of columns.value) {
      const card = column.cards.find((item) => item.id === cardId);
      if (card) return card;
    }
    return undefined;
  }

  function clearSaveTimer(cardId: string) {
    const timer = saveTimers.get(cardId);
    if (timer) clearTimeout(timer);
    saveTimers.delete(cardId);
  }

  function nextVersion(cardId: string) {
    const version = (versions.get(cardId) ?? 0) + 1;
    versions.set(cardId, version);
    return version;
  }

  function cardPayload(card: Card) {
    return {
      id: card.id,
      board_id: activeBoardId.value,
      column_id: card.columnId,
      title: card.title,
      description: documentToJSON(normalizeDescription(card.description)),
      position: card.position,
      due_date: card.dueDate,
      due_time: card.dueTime,
      estimated_duration: card.estimatedDuration,
      complexity: card.complexity,
    };
  }

  async function writeCard(cardId: string, version: number) {
    clearSaveTimer(cardId);
    const card = findCard(cardId);
    if (!card || !activeBoardId.value || !supabase) return;
    saveStates.value = { ...saveStates.value, [cardId]: "saving" };
    const payload = cardPayload(card);
    const request = unsavedCards.has(cardId)
      ? supabase.from("cards").upsert(payload)
      : supabase.from("cards").update(payload).eq("id", cardId).eq("board_id", activeBoardId.value);
    const { error } = await request;
    if (error) {
      if (versions.get(cardId) === version) saveStates.value = { ...saveStates.value, [cardId]: "error" };
      return;
    }
    unsavedCards.delete(cardId);
    if (versions.get(cardId) === version) saveStates.value = { ...saveStates.value, [cardId]: "saved" };
  }

  function persistCard(cardId: string, version = versions.get(cardId) ?? 0) {
    const previous = saveChains.get(cardId) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(() => writeCard(cardId, version));
    saveChains.set(cardId, task);
    void task.finally(() => {
      if (saveChains.get(cardId) === task) saveChains.delete(cardId);
    });
    return task;
  }

  function scheduleSave(cardId: string) {
    if (!findCard(cardId)) return;
    clearSaveTimer(cardId);
    const version = nextVersion(cardId);
    saveStates.value = { ...saveStates.value, [cardId]: "saving" };
    saveTimers.set(cardId, setTimeout(() => void persistCard(cardId, version), saveDelay));
  }

  function flushCard(cardId: string) {
    if (!findCard(cardId)) return;
    clearSaveTimer(cardId);
    void persistCard(cardId, versions.get(cardId) ?? 0);
  }

  function retryCard(cardId: string) {
    if (!findCard(cardId)) return;
    scheduleSave(cardId);
  }

  async function load() {
    if (!supabase || !auth.session?.user) return;
    isLoading.value = true;
    loadError.value = null;
    try {
      const { data: existingBoard, error: boardError } = await supabase.from("boards").select("id").order("created_at").limit(1).maybeSingle();
      if (boardError) throw boardError;
      let board = existingBoard;
      if (!board) {
        const { data, error } = await supabase.from("boards").insert({ owner_id: auth.session.user.id, name: "Mon espace de travail" }).select("id").single();
        if (error) throw error;
        board = data;
      }
      if (!board?.id) throw new Error("Impossible de créer le board personnel.");
      activeBoardId.value = board.id;

      let { data: columnData, error: columnError } = await supabase.from("board_columns").select("id, title, position").eq("board_id", board.id).order("position");
      if (columnError) throw columnError;
      if (!columnData?.length) {
        const { data, error } = await supabase
          .from("board_columns")
          .insert(columnDefinitions.map((column, position) => ({ board_id: board.id, ...column, position })))
          .select("id, title, position");
        if (error) throw error;
        columnData = data;
      }

      const { data, error } = await supabase
        .from("cards")
        .select("id, board_id, column_id, title, description, position, due_date, due_time, estimated_duration, complexity, created_at")
        .eq("board_id", board.id)
        .order("column_id")
        .order("position");
      if (error) throw error;
      const nextColumns: Column[] = ((columnData ?? []) as ColumnRow[]).map((column) => ({ id: column.id, title: column.title, cards: [] }));
      for (const row of (data ?? []) as CardRow[]) {
        const card = fromRow(row);
        let column = nextColumns.find((item) => item.id === card.columnId);
        if (!column) {
          column = { id: card.columnId, title: "Colonne personnalisée", cards: [] };
          nextColumns.push(column);
        }
        column.cards.push(card);
      }
      columns.value = nextColumns;
      saveStates.value = Object.fromEntries((data ?? []).map((row: CardRow) => [row.id, "saved"]));
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : "Impossible de charger les cartes.";
    } finally {
      isLoading.value = false;
    }
  }

  function addColumn() {
    const column: Column = { id: v4(), title: "Nouvelle colonne", cards: [] };
    columns.value.push(column);
    if (supabase && activeBoardId.value) {
      void supabase.from("board_columns").insert({ board_id: activeBoardId.value, id: column.id, title: column.title, position: columns.value.length - 1 });
    }
  }

  function updateColumn(id: string, title: string) {
    columns.value = columns.value.map((column) => column.id === id ? { ...column, title: title.trim() || "Sans titre" } : column);
    const column = columns.value.find((item) => item.id === id);
    if (supabase && activeBoardId.value && column) void supabase.from("board_columns").update({ title: column.title }).eq("board_id", activeBoardId.value).eq("id", id);
  }

  function removeColumn(id: string) {
    columns.value = columns.value.filter((column) => column.id !== id);
    if (supabase && activeBoardId.value) {
      void supabase.from("cards").delete().eq("board_id", activeBoardId.value).eq("column_id", id);
      void supabase.from("board_columns").delete().eq("board_id", activeBoardId.value).eq("id", id);
    }
  }

  function addCard(columnId: string) {
    const column = columns.value.find((item) => item.id === columnId);
    if (!column || !activeBoardId.value) return;
    const card: Card = {
      id: v4(), title: "Nouvelle tâche", description: documentToJSON(emptyDocument()), position: column.cards.length,
      createdAt: new Date().toISOString().slice(0, 10), dueDate: null, dueTime: null, estimatedDuration: null, complexity: "medium", columnId,
    };
    column.cards.push(card);
    unsavedCards.add(card.id);
    scheduleSave(card.id);
    void sendTaskNotification(card, "created");
  }

  function updateCard(columnId: string, cardId: string, patch: Partial<Pick<Card, "title" | "description" | "dueDate" | "dueTime" | "estimatedDuration" | "complexity">>, notify = false) {
    const card = columns.value.find((column) => column.id === columnId)?.cards.find((item) => item.id === cardId);
    if (!card) return;
    Object.assign(card, patch, { description: documentToJSON(normalizeDescription(patch.description ?? card.description)) });
    scheduleSave(cardId);
    if (notify) void sendTaskNotification(card, "updated");
  }

  async function sendTaskNotification(card: Card, action: TaskNotificationAction) {
    if (!supabase || !auth.notificationsEnabled) return;
    await supabase.functions.invoke("send-task-notification", {
      body: { action, task: { id: card.id, title: card.title, description: descriptionToPlainText(card.description), dueDate: card.dueDate, dueTime: card.dueTime, estimatedDuration: card.estimatedDuration, complexity: card.complexity } },
    });
  }

  function removeCard(columnId: string, cardId: string) {
    const column = columns.value.find((item) => item.id === columnId);
    const index = column?.cards.findIndex((card) => card.id === cardId) ?? -1;
    const card = index >= 0 ? column?.cards[index] : undefined;
    if (!column || !card || index < 0) return;
    clearSaveTimer(cardId);
    column.cards.splice(index, 1);
    void (async () => {
      if (!supabase || !activeBoardId.value || unsavedCards.has(cardId)) return;
      const { error } = await supabase.from("cards").delete().eq("id", cardId).eq("board_id", activeBoardId.value);
      if (error) {
        column.cards.splice(index, 0, card);
        saveStates.value = { ...saveStates.value, [cardId]: "error" };
      }
    })();
  }

  function moveCard(cardId: string, sourceColumnId: string, targetColumnId: string, targetIndex: number) {
    const source = columns.value.find((column) => column.id === sourceColumnId);
    const target = columns.value.find((column) => column.id === targetColumnId);
    if (!source || !target) return;
    const sourceIndex = source.cards.findIndex((card) => card.id === cardId);
    if (sourceIndex < 0) return;
    const [card] = source.cards.splice(sourceIndex, 1);
    if (!card) return;
    const index = Math.max(0, Math.min(targetIndex - (source === target && sourceIndex < targetIndex ? 1 : 0), target.cards.length));
    card.columnId = targetColumnId;
    target.cards.splice(index, 0, card);
    for (const column of new Set([source, target])) {
      column.cards.forEach((item, position) => {
        item.position = position;
        scheduleSave(item.id);
      });
    }
  }

  function selectWorkspace(id: string) {
    if (workspaces.some((workspace) => workspace.id === id)) activeWorkspaceId.value = id;
  }

  return { columns, workspaces, activeWorkspace, activeWorkspaceId, activeBoardId, searchQuery, isLoading, loadError, saveStates, selectWorkspace, load, addColumn, updateColumn, removeColumn, addCard, updateCard, removeCard, moveCard, flushCard, retryCard };
});
