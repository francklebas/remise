export interface Column {
  id: string;
  title: string | null;
  cards: Card[];
}

export interface Card {
  id: string;
  title: string;
  columnId: string;
}
