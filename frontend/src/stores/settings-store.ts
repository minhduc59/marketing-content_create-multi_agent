import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  keywords: string[];
  industry: string;
  addKeyword: (keyword: string) => void;
  removeKeyword: (keyword: string) => void;
  setIndustry: (industry: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      keywords: [],
      industry: "technology",

      addKeyword: (keyword) =>
        set((s) => {
          const normalized = keyword.trim().toLowerCase();
          if (!normalized || s.keywords.includes(normalized)) return s;
          return { keywords: [...s.keywords, normalized] };
        }),

      removeKeyword: (keyword) =>
        set((s) => ({
          keywords: s.keywords.filter((k) => k !== keyword),
        })),

      setIndustry: (industry) => set({ industry }),
    }),
    { name: "mcc-settings" }
  )
);
