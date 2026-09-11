export interface Column {
  id: string;
  title: string;
  cards: Card[];
}

export interface Card {
  id: string;
  title: string;
  description: string;
  columnId: string;
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
}
