import { defineStore } from "pinia";
import { v4 } from "uuid";
import { computed, ref } from "vue";
import type { BoardSummary, Card, CardComplexity, CardSaveStatus, Column, TaskNotificationAction, Workspace } from "@/types/board";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { currentBoardId, setBoardUrl } from "@/router";
import { descriptionStoragePaths, descriptionToPlainText, documentToJSON, emptyDocument, normalizeDescription } from "@/editor/document";
import { deleteImages } from "@/editor/media";

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

type BoardRow = { id: string; workspace_id: string; name: string; archived_at: string | null };

const boardFields = "id, workspace_id, name, archived_at";
const defaultBoardName = "Mon espace de travail";
const newBoardName = "Nouveau board";

const lastWorkspaceKey = (userId: string) => `remise:last-workspace:${userId}`;

function readLastWorkspace(userId: string) {
  try {
    return window.localStorage.getItem(lastWorkspaceKey(userId));
  } catch {
    return null;
  }
}

function rememberLastWorkspace(userId: string, workspaceId: string) {
  try {
    window.localStorage.setItem(lastWorkspaceKey(userId), workspaceId);
  } catch {
    // Storage can be unavailable (private mode); the first workspace is used instead.
  }
}

function isBoardQuotaError(error: unknown) {
  return (error as { hint?: string } | null)?.hint === "quota_boards";
}

function boardFromRow(row: BoardRow): BoardSummary {
  return { id: row.id, name: row.name, archivedAt: row.archived_at };
}

const defaultWorkspace: Pick<Workspace, "name" | "color"> = { name: "Personnel", color: "primary" };

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
  const workspaces = ref<Workspace[]>([]);
  const activeWorkspaceId = ref<string | null>(null);
  const searchQuery = ref("");
  const columns = ref<Column[]>(emptyColumns());
  const activeBoardId = ref<string | null>(null);
  const boards = ref<BoardSummary[]>([]);
  const activeBoard = computed(() => boards.value.find(({ id }) => id === activeBoardId.value));
  const boardError = ref<string | null>(null);
  const workspaceError = ref<string | null>(null);
  const boardQuotaReached = ref(false);
  let loadToken = 0;
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);
  const saveStates = ref<Record<string, CardSaveStatus>>({});
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const saveChains = new Map<string, Promise<void>>();
  const versions = new Map<string, number>();
  const unsavedCards = new Set<string>();
  const activeWorkspace = computed(() => workspaces.value.find(({ id }) => id === activeWorkspaceId.value));

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

  async function flushAllCards() {
    for (const cardId of [...saveTimers.keys()]) flushCard(cardId);
    await Promise.allSettled([...saveChains.values()]);
  }

  function retryCard(cardId: string) {
    if (!findCard(cardId)) return;
    scheduleSave(cardId);
  }

  async function loadWorkspaces(userId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("workspaces").select("id, name, color").order("created_at");
    if (error) throw error;
    let rows = (data ?? []) as Workspace[];
    if (!rows.length) {
      const { data: created, error: createError } = await supabase.from("workspaces").insert({ owner_id: userId, ...defaultWorkspace }).select("id, name, color").single();
      if (createError) throw createError;
      rows = [created as Workspace];
    }
    workspaces.value = rows;
    if (!rows.some(({ id }) => id === activeWorkspaceId.value)) {
      const remembered = readLastWorkspace(userId);
      activeWorkspaceId.value = rows.find(({ id }) => id === remembered)?.id ?? rows[0]!.id;
    }
  }

  async function createBoardRow(workspaceId: string, name: string) {
    if (!supabase) throw new Error("Supabase n’est pas configuré.");
    const { data, error } = await supabase.from("boards").insert({ workspace_id: workspaceId, name }).select(boardFields).single();
    if (error) throw error;
    const board = data as BoardRow;
    const { error: columnError } = await supabase
      .from("board_columns")
      .insert(columnDefinitions.map((column, position) => ({ board_id: board.id, ...column, position })));
    if (columnError) throw columnError;
    return board;
  }

  async function resolveBoard(requestedBoardId: string | null) {
    if (!supabase) return null;
    let candidateId = requestedBoardId;
    const linkedCardId = new URLSearchParams(window.location.search).get("card");
    if (!candidateId && linkedCardId) {
      const { data } = await supabase.from("cards").select("board_id").eq("id", linkedCardId).maybeSingle();
      candidateId = (data as { board_id: string } | null)?.board_id ?? null;
      if (candidateId) requestedBoardId = candidateId;
    }
    candidateId ??= activeBoardId.value;
    if (candidateId) {
      const { data, error } = await supabase.from("boards").select(boardFields).eq("id", candidateId).maybeSingle();
      if (error) throw error;
      const board = data as BoardRow | null;
      if (board && (requestedBoardId || board.workspace_id === activeWorkspaceId.value) && workspaces.value.some(({ id }) => id === board.workspace_id)) {
        activeWorkspaceId.value = board.workspace_id;
        return board.id;
      }
    }
    return null;
  }

  async function loadBoards(workspaceId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("boards").select(boardFields).eq("workspace_id", workspaceId).order("created_at");
    if (error) throw error;
    boards.value = ((data ?? []) as BoardRow[]).map(boardFromRow);
  }

  async function loadBoardContent(boardId: string) {
    if (!supabase) return;
    const { data: columnData, error: columnError } = await supabase.from("board_columns").select("id, title, position").eq("board_id", boardId).order("position");
    if (columnError) throw columnError;
    const { data, error } = await supabase
      .from("cards")
      .select("id, board_id, column_id, title, description, position, due_date, due_time, estimated_duration, complexity, created_at")
      .eq("board_id", boardId)
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
    return { columns: nextColumns, saveStates: Object.fromEntries((data ?? []).map((row: CardRow) => [row.id, "saved" as const])) };
  }

  async function load(requestedBoardId: string | null = currentBoardId(), { push = false } = {}) {
    if (!supabase || !auth.session?.user) return;
    const token = ++loadToken;
    isLoading.value = true;
    loadError.value = null;
    try {
      await loadWorkspaces(auth.session.user.id);
      let boardId = await resolveBoard(requestedBoardId);
      const workspaceId = activeWorkspaceId.value;
      if (!workspaceId) throw new Error("Impossible de charger l’espace de travail.");
      await loadBoards(workspaceId);
      boardId ??= boards.value.find((board) => !board.archivedAt)?.id ?? null;
      if (!boardId) {
        try {
          const board = await createBoardRow(workspaceId, defaultBoardName);
          boards.value = [...boards.value, boardFromRow(board)];
          boardId = board.id;
        } catch (error) {
          if (!isBoardQuotaError(error)) throw error;
          if (token !== loadToken) return;
          // An empty workspace on a full plan: show it without a board.
          activeBoardId.value = null;
          columns.value = [];
          saveStates.value = {};
          showBoardError(error);
          rememberLastWorkspace(auth.session.user.id, workspaceId);
          return;
        }
      }
      const content = await loadBoardContent(boardId);
      if (token !== loadToken || !content) return;
      activeBoardId.value = boardId;
      rememberLastWorkspace(auth.session.user.id, workspaceId);
      columns.value = content.columns;
      saveStates.value = content.saveStates;
      if (currentBoardId() !== boardId) setBoardUrl(boardId, { replace: !push });
    } catch (error) {
      if (token === loadToken) loadError.value = error instanceof Error ? error.message : "Impossible de charger les cartes.";
    } finally {
      if (token === loadToken) isLoading.value = false;
    }
  }

  async function openBoard(boardId: string | null, { push = true } = {}) {
    if (boardId && boardId === activeBoardId.value) return;
    await flushAllCards();
    await load(boardId, { push });
  }

  function showBoardError(error: unknown) {
    boardQuotaReached.value = isBoardQuotaError(error);
    boardError.value = (error as { message?: string } | null)?.message ?? "Impossible de créer le board.";
  }

  async function createBoard(name: string) {
    const workspaceId = activeWorkspaceId.value;
    if (!workspaceId) return;
    try {
      const board = await createBoardRow(workspaceId, name.trim() || newBoardName);
      boardError.value = null;
      boardQuotaReached.value = false;
      boards.value = [...boards.value, boardFromRow(board)];
      await openBoard(board.id);
    } catch (error) {
      showBoardError(error);
    }
  }

  async function updateBoard(boardId: string, patch: { name?: string; archived_at?: string | null }) {
    if (!supabase) return false;
    const previous = boards.value;
    boards.value = boards.value.map((board) => board.id === boardId
      ? { ...board, ...(patch.name !== undefined && { name: patch.name }), ...(patch.archived_at !== undefined && { archivedAt: patch.archived_at }) }
      : board);
    const { error } = await supabase.from("boards").update(patch).eq("id", boardId);
    if (error) {
      boards.value = previous;
      boardError.value = error.message;
      return false;
    }
    boardError.value = null;
    return true;
  }

  function renameBoard(boardId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || boards.value.find(({ id }) => id === boardId)?.name === trimmed) return Promise.resolve(false);
    return updateBoard(boardId, { name: trimmed });
  }

  async function leaveBoard(boardId: string) {
    if (boardId !== activeBoardId.value) return;
    const next = boards.value.find((board) => board.id !== boardId && !board.archivedAt);
    activeBoardId.value = null;
    await load(next?.id ?? null, { push: true });
  }

  async function archiveBoard(boardId: string) {
    if (await updateBoard(boardId, { archived_at: new Date().toISOString() })) await leaveBoard(boardId);
  }

  function restoreBoard(boardId: string) {
    return updateBoard(boardId, { archived_at: null });
  }

  async function storagePathsOfBoards(boardIds: string[]) {
    if (!supabase || !boardIds.length) return [];
    const { data, error } = await supabase.from("cards").select("description").in("board_id", boardIds);
    if (error) throw error;
    return ((data ?? []) as Array<{ description: unknown }>).flatMap(({ description }) => descriptionStoragePaths(description));
  }

  async function deleteBoard(boardId: string) {
    if (!supabase) return;
    if (boardId === activeBoardId.value) await flushAllCards();
    const imagePaths = await storagePathsOfBoards([boardId]).catch(() => []);
    const { error } = await supabase.from("boards").delete().eq("id", boardId);
    if (error) {
      boardError.value = error.message;
      return;
    }
    boardError.value = null;
    void deleteImages(imagePaths);
    const wasActive = boardId === activeBoardId.value;
    boards.value = boards.value.filter(({ id }) => id !== boardId);
    if (wasActive) await leaveBoard(boardId);
  }

  function addColumn() {
    if (!activeBoardId.value) return;
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

  async function createWorkspace(name: string, color: string) {
    if (!supabase || !auth.session?.user) return false;
    const { data, error } = await supabase.from("workspaces").insert({ owner_id: auth.session.user.id, name: name.trim(), color }).select("id, name, color").single();
    if (error) {
      workspaceError.value = error.message;
      return false;
    }
    workspaceError.value = null;
    workspaces.value = [...workspaces.value, data as Workspace];
    selectWorkspace((data as Workspace).id);
    return true;
  }

  async function updateWorkspace(id: string, patch: Pick<Workspace, "name" | "color">) {
    if (!supabase) return false;
    const { error } = await supabase.from("workspaces").update({ name: patch.name.trim(), color: patch.color }).eq("id", id);
    if (error) {
      workspaceError.value = error.message;
      return false;
    }
    workspaceError.value = null;
    workspaces.value = workspaces.value.map((workspace) => workspace.id === id ? { ...workspace, name: patch.name.trim(), color: patch.color } : workspace);
    return true;
  }

  async function deleteWorkspace(id: string) {
    if (!supabase || workspaces.value.length <= 1) return false;
    const isActive = id === activeWorkspaceId.value;
    if (isActive) await flushAllCards();
    let imagePaths: string[] = [];
    try {
      const { data, error } = await supabase.from("boards").select("id").eq("workspace_id", id);
      if (error) throw error;
      imagePaths = await storagePathsOfBoards(((data ?? []) as Array<{ id: string }>).map((board) => board.id));
    } catch {
      // Image cleanup is best effort; deleting the data must not depend on it.
    }
    const { error } = await supabase.from("workspaces").delete().eq("id", id);
    if (error) {
      workspaceError.value = error.message;
      return false;
    }
    workspaceError.value = null;
    void deleteImages(imagePaths);
    workspaces.value = workspaces.value.filter((workspace) => workspace.id !== id);
    if (isActive) {
      activeWorkspaceId.value = workspaces.value[0]?.id ?? null;
      activeBoardId.value = null;
      await load(null, { push: true });
    }
    return true;
  }

  function selectWorkspace(id: string) {
    if (id === activeWorkspaceId.value || !workspaces.value.some((workspace) => workspace.id === id)) return;
    void flushAllCards().then(() => {
      activeWorkspaceId.value = id;
      activeBoardId.value = null;
      return load(null, { push: true });
    });
  }

  return { columns, workspaces, activeWorkspace, activeWorkspaceId, boards, activeBoard, activeBoardId, searchQuery, isLoading, loadError, boardError, boardQuotaReached, workspaceError, saveStates, selectWorkspace, createWorkspace, updateWorkspace, deleteWorkspace, load, openBoard, createBoard, renameBoard, archiveBoard, restoreBoard, deleteBoard, addColumn, updateColumn, removeColumn, addCard, updateCard, removeCard, moveCard, flushCard, retryCard };
});
