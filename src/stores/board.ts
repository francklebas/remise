import { defineStore } from "pinia";
import { v4 } from "uuid";
import { ref } from "vue";
import type { Card, Column } from "@/types/board";

export const useBoardStore = defineStore("board", () => {
  const count = ref(0);
  const columns = ref<Column[]>([]);
  const cards = ref<Card[]>([]);

  function addColumn() {
    columns.value.push({ id: v4(), title: null, cards: [] });
  }

  function addCard() {
    columns.value.map(
      (col) =>
        (col.cards = [
          ...col.cards,
          { name: null, description: null, cards: [] },
        ]),
    );
  }

  return { columns, addColumn, addCard, cards, count };
});
