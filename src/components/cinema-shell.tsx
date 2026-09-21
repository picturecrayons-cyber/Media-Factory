import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CinemaNav } from "@/components/cinema-nav";
import { SearchOverlay } from "@/components/search-overlay";
import { useCinemaUI } from "@/lib/cinema-ui";
import type { Title } from "@/lib/catalog";
import type { ReactNode } from "react";

export function CinemaShell({
  children,
  titles,
  allowKids = false,
}: {
  children: ReactNode;
  titles: Title[];
  allowKids?: boolean;
}) {
  const kidsMode = useCinemaUI((s) => s.kidsMode);
  const navigate = useNavigate();

  useEffect(() => {
    if (kidsMode && !allowKids) {
      void navigate({ to: "/kids" });
    }
  }, [kidsMode, allowKids, navigate]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-bg"
      >
        Skip to cinema content
      </a>
      <CinemaNav />
      <SearchOverlay titles={titles} />
      <div id="main-content">{children}</div>
      <footer className="border-t border-line px-6 py-10 text-center text-xs text-faint">
        CRAYONS LOOP · Premium global streaming · Every language we hold. Every form we can right.
      </footer>
    </div>
  );
}
