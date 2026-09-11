import { defineStore } from "pinia";
import { v4 } from "uuid";

export const useBoardStore = defineStore("board", {
  state: () => ({
    count: 0,
    cards: [],
    columns: [],
  }),
  getters: {},
  actions: {
    addColumn() {
      this.columns = [...this.columns, { id: v4(), title: null }];
    },
  },
});
