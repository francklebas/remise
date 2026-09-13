export interface Column {
  id: string;
  title: string;
  cards: Card[];
}

export interface Card {
  id: string;
  title: string;
  description: CardDescription;
  createdAt: string;
  dueDate: string | null;
  dueTime: string | null;
  estimatedDuration: number | null;
  complexity: CardComplexity;
  columnId: string;
}

export type CardComplexity = "low" | "medium" | "high";

export type TaskNotificationAction = "created" | "updated";

export interface Workspace {
  id: string;
  name: string;
  color: string;
}
import type { CardDescription } from "@/editor/document";
