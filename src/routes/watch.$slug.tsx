import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CinemaPlayer } from "@/components/player";
import { getTitleBySlug } from "@/lib/cinema";
import { CATALOG } from "@/lib/catalog";

export const Route = createFileRoute("/watch/$slug")({ component: Watch });

function Watch() {
  const { slug } = Route.useParams();
  const q = useQuery({ queryKey: ["title", slug], queryFn: () => getTitleBySlug({ data: { slug } }) });
  const title = q.data ?? CATALOG.find((t) => t.slug === slug);
  if (!title) return <main className="grid min-h-screen place-items-center text-muted">Title not found.</main>;
  return <CinemaPlayer title={title} />;
}
