import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listTitles, setTitlePublished } from "@/lib/cinema";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/admin/titles")({ component: AdminTitles });

function AdminTitles() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({ queryKey: ["titles"], queryFn: () => listTitles(), enabled: !!user });
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (p: { id: string; published: boolean }) => setTitlePublished({ data: p }),
    onSuccess: (_, p) => {
      toast(p.published ? "Published to public rails" : "Unpublished · studio draft");
      void qc.invalidateQueries({ queryKey: ["titles"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;

  const titles = q.data ?? [];
  const live = titles.filter((t) => t.published).length;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.22em] text-loop uppercase">CC 01</p>
          <h1 className="font-display mt-1 text-3xl tracking-wide">Titles & Catalog</h1>
          <p className="mt-2 text-sm text-muted">
            {live} live · {titles.length} total · 2:3 posters · 16:9 backdrops
          </p>
        </div>
      </div>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[11px] tracking-wide text-muted uppercase">
            <tr>
              <th className="pb-3 font-medium">Title</th>
              <th className="pb-3 font-medium">Lang</th>
              <th className="pb-3 font-medium">Tier</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">HLS</th>
              <th className="pb-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {titles.map((t) => (
              <tr key={t.id} className="border-t border-line">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <img src={t.posterPath} alt="" className="h-14 w-10 rounded-sm object-cover" />
                    <div>
                      <p>{t.title}</p>
                      <p className="text-xs text-muted">
                        {t.year} · {t.maturityRating} · {t.contentType}
                      </p>
                    </div>
                  </div>
                </td>
                <td>{t.language}</td>
                <td>{t.accessTier}</td>
                <td>
                  <span className={cn("text-xs uppercase", t.published ? "text-ok" : "text-warn")}>
                    {t.published ? "Live" : "Draft"}
                  </span>
                </td>
                <td className="text-xs text-muted">{t.hlsReady ? "1080/720/480" : "—"}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link to="/title/$slug" params={{ slug: t.slug }} className="text-xs text-muted hover:text-fg">
                      View
                    </Link>
                    <Button
                      variant={t.published ? "outline" : "primary"}
                      className="h-9 px-3 text-xs"
                      onClick={() => mut.mutate({ id: t.id, published: !t.published })}
                    >
                      {t.published ? "Unpublish" : "Publish live"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
