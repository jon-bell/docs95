import { create } from 'zustand';

export type DialogId =
  | 'about'
  | 'open'
  | 'saveAs'
  | 'print'
  | 'font'
  | 'paragraph'
  | 'pageSetup'
  | 'fontDialog'
  | 'paragraphDialog'
  | 'styleDialog'
  | 'bulletsDialog'
  | 'findReplaceDialog';

export interface UIState {
  readonly openDialog: DialogId | null;
  readonly statusText: string;
  readonly activePage: number;
  readonly totalPages: number;
}

export interface UIActions {
  setStatus(text: string): void;
  // Named `showDialog` rather than `openDialog` because TypeScript (strict) forbids
  // a property and a method with the same identifier in the same merged type.
  // The state slot `openDialog` holds the currently open dialog id.
  showDialog(id: DialogId): void;
  closeDialog(): void;
  setPagination(active: number, total: number): void;
}

export type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>((set) => ({
  openDialog: null,
  statusText: '',
  activePage: 1,
  totalPages: 1,

  setStatus(text: string): void {
    set({ statusText: text });
  },

  showDialog(id: DialogId): void {
    set({ openDialog: id });
  },

  closeDialog(): void {
    set({ openDialog: null });
  },

  setPagination(active: number, total: number): void {
    set({ activePage: active, totalPages: total });
  },
}));
