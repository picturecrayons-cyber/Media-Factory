import { create } from "zustand";
import { persist } from "zustand/middleware";

type CinemaUI = {
  kidsMode: boolean;
  searchOpen: boolean;
  query: string;
  setKidsMode: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setQuery: (v: string) => void;
};

export const useCinemaUI = create<CinemaUI>()(
  persist(
    (set) => ({
      kidsMode: false,
      searchOpen: false,
      query: "",
      setKidsMode: (kidsMode) => set({ kidsMode }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setQuery: (query) => set({ query }),
    }),
    { name: "loop-cinema-ui" },
  ),
);
