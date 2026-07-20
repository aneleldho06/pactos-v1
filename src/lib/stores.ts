import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";
import type { Block } from "./types";
import { familyBlocks } from "./mock";
import type { AuthSession } from "./api";

interface UIState {
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (t: "light" | "dark") => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggleTheme: () => set({ theme: get().theme === "light" ? "dark" : "light" }),
      setTheme: (t) => set({ theme: t }),
    }),
    { name: "flowledger-ui" },
  ),
);

export type ConnectionStatus = "disconnected" | "connecting" | "connected";
export type AuthStatus = "idle" | "verifying" | "authenticated" | "failed";

interface SessionState {
  walletAddress: string | null;
  userId: string | null;
  accessToken: string | null;
  /** Pre-auth wallet connection state (set immediately after requestAccess). */
  connectionStatus: ConnectionStatus;
  /** Authentication lifecycle state. */
  authStatus: AuthStatus;
  /** Last authentication error message, if any. */
  authError: string | null;
  setWalletAddress: (address: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setAuthStatus: (status: AuthStatus, error?: string | null) => void;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
  /** Reset connection + auth without clearing the session (for retry). */
  resetAuth: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      walletAddress: null,
      userId: null,
      accessToken: null,
      connectionStatus: "disconnected",
      authStatus: "idle",
      authError: null,
      setWalletAddress: (address) => set({ walletAddress: address }),
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setAuthStatus: (status, error = null) => set({ authStatus: status, authError: error }),
      setSession: (session) =>
        set({
          walletAddress: session.user.walletAddress,
          userId: session.user.id,
          accessToken: session.accessToken,
          connectionStatus: "connected",
          authStatus: "authenticated",
          authError: null,
        }),
      clearSession: () =>
        set({
          walletAddress: null,
          userId: null,
          accessToken: null,
          connectionStatus: "disconnected",
          authStatus: "idle",
          authError: null,
        }),
      resetAuth: () =>
        set({
          connectionStatus: "disconnected",
          authStatus: "idle",
          authError: null,
        }),
    }),
    { name: "pactos-session" },
  ),
);

interface BuilderState {
  name: string;
  description: string;
  blocks: Block[];
  setName: (n: string) => void;
  setDescription: (d: string) => void;
  addBlock: (b: Block) => void;
  removeBlock: (id: string) => void;
  moveBlock: (id: string, dir: -1 | 1) => void;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  loadTemplate: (blocks: Block[], name?: string) => void;
  reset: () => void;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  name: "Family Agreement",
  description: "Auto-split monthly salary to parents, education, and savings.",
  blocks: familyBlocks,
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  addBlock: (block) => set({ blocks: [...get().blocks, block] }),
  removeBlock: (id) => set({ blocks: get().blocks.filter((b) => b.id !== id) }),
  moveBlock: (id, dir) => {
    const bs = [...get().blocks];
    const idx = bs.findIndex((b) => b.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= bs.length) return;
    [bs[idx], bs[to]] = [bs[to], bs[idx]];
    set({ blocks: bs });
  },
  updateBlock: (id, patch) =>
    set({ blocks: get().blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }),
  loadTemplate: (blocks, name) => set({ blocks, ...(name ? { name } : {}) }),
  reset: () => set({ name: "New Agreement", description: "", blocks: [] }),
}));

export function useApplyTheme() {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
}
