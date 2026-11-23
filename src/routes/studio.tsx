import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";
import { listTitles } from "@/lib/bridge/titles";
import { getDitWorkspace } from "@/lib/bridge/dit-agent";

export const Route = createFileRoute("/studio")({ component: Studio });

type StudioTab = "overview" | "titles" | "vault" | "dit" | "team";

const TABS: Array<{ id: StudioTab; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Studio activity and recent work" },
  { id: "titles", label: "Titles & Stories", description: "Finished films and story concepts" },
  { id: "vault", label: "Document Vault", description: "Private rights and ownership evidence" },
  { id: "dit", label: "DIT Agent", description: "Camera-card ingest and verification" },
  { id: "team", label: "Team & Account", description: "Organization and member access" },
];

function Studio() {
  const [active, setActive] = useState<StudioTab>("overview");
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const ditQ = useQuery({ queryKey: ["studio-dit-workspace-kpi"], queryFn: () => getDitWorkspace() });

  const titles = titlesQ.data?.titles ?? [];
  const finished = useMemo(() => titles.filter((title) => title.submissionType !== "story_concept"), [titles]);
  const concepts = useMemo(() => titles.filter((title) => title.submissionType === "story_concept"), [titles]);
  const documentsCount = "—";
  const ditSessions = ditQ.data?.sessions?.length;

  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio Workspace">
          <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="space-y-2">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
                <h2 className="mt-2 font-display text-xl font-semibold">{actor.organizationName || actor.displayName}</h2>
                <p className="mt-2 text-xs leading-5 text-muted">Studio-owned titles and verified organization operations.</p>
                <div className="mt-4 grid gap-2">
                  <Link to="/submit-film" className="rounded-full bg-accent px-4 py-2.5 text-center text-sm font-semibold text-[#041018]">+ New submission</Link>
                  <Link to="/deliveries" className="rounded-full border border-line px-4 py-2.5 text-center text-sm font-semibold">View deliveries</Link>
                </div>
              </div>
              <nav aria-label="Studio workspace navigation" className="rounded-2xl border border-line bg-surface p-2">
                {TABS.map((tab) => (
                  <button key={tab.id} type="button" onClick={() => setActive(tab.id)}
                    aria-current={active === tab.id ? "page" : undefined}
                    className={`mb-1 w-full rounded-xl px-3 py-3 text-left transition ${active === tab.id ? "bg-accent-soft text-fg" : "text-muted hover:bg-elevated hover:text-fg"}`}>
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span className="mt-1 block text-[11px] leading-4 opacity-80">{tab.description}</span>
                  </button>
                ))}
                <Link to="/account" className="block rounded-xl px-3 py-3 text-sm font-semibold text-muted hover:bg-elevated hover:text-fg">Account settings ↗</Link>
              </nav>
              <p className="px-2 text-[11px] leading-5 text-muted">Studio membership and title visibility are enforced by server-side authorization.</p>
            </aside>

            <div className="min-w-0 space-y-5">
              {active === "overview" ? (
                <>
                  <section className="flex flex-wrap items-end justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Executive overview</p><h2 className="mt-1 font-display text-2xl font-semibold">Studio activity</h2><p className="mt-1 text-sm text-muted">Current records only. Review and publication decisions remain separate.</p></div>
                    <button type="button" onClick={() => setActive("titles")} className="text-sm font-semibold text-accent hover:underline">View all titles →</button>
                  </section>
                  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Studio KPIs">
                    <Kpi label="Finished films" value={titlesQ.isPending || titlesQ.isError ? "—" : String(finished.length)} detail="Studio catalogue" />
                    <Kpi label="Story concepts" value={titlesQ.isPending || titlesQ.isError ? "—" : String(concepts.length)} detail="Separate curation flow" />
                    <Kpi label="Vault documents" value={documentsCount} detail="Count shown after verification data is loaded" />
                    <Kpi label="Active DIT sessions" value={ditQ.isPending || ditQ.isError ? "—" : String(ditSessions ?? 0)} detail="Ingest sessions" />
                  </section>
                  {titlesQ.isError ? <Retry message="Studio titles could not be loaded." onRetry={() => void titlesQ.refetch()} /> : null}
                  {ditQ.isError ? <Retry message="DIT session count is temporarily unavailable." onRetry={() => void ditQ.refetch()} /> : null}
                  <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">Recently updated titles</h3><p className="mt-1 text-xs text-muted">Latest five records authorized for this studio</p></div><button type="button" onClick={() => setActive("titles")} className="text-sm font-semibold text-accent">View all →</button></div>
                    {titlesQ.isPending ? <p className="mt-4 text-sm text-muted">Loading recent titles…</p> : titlesQ.isError ? <Retry message="Could not load recent titles." onRetry={() => void titlesQ.refetch()} /> : !titles.length ? <p className="mt-4 text-sm text-muted">No studio titles available yet.</p> : (
                      <ul className="mt-4 divide-y divide-line">
                        {[...titles].sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime()).slice(0,5).map((title)=>(
                          <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div className="min-w-0"><Link to="/title/$id" params={{id:title.id}} className="font-semibold hover:text-accent">{title.name}</Link><p className="mt-1 text-xs text-muted">{title.submissionType === "story_concept" ? "Story Concept" : "Finished Film"} · {title.language}{title.year ? ` · ${title.year}` : ""}</p></div>
                            <span className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold">{title.status.replaceAll("_"," ")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className="grid gap-3 sm:grid-cols-2">
                    <ActionCard title="Manage titles and stories" text="Find real films, filter status and open the canonical title record." onClick={()=>setActive("titles")} />
                    <ActionCard title="Private Document Vault" text="Manage reusable ownership and rights evidence." onClick={()=>setActive("vault")} />
                    <ActionCard title="DIT Agent" text="Register camera-card manifests and verify two-copy ingest." onClick={()=>setActive("dit")} />
                    <ActionCard title="Team & Account" text="Review the verified organization roster." onClick={()=>setActive("team")} />
                  </section>
                </>
              ) : null}

              {active === "titles" ? (
                <section className="space-y-5">
                  <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Studio catalogue</p><h2 className="mt-1 font-display text-2xl font-semibold">Titles & Stories</h2><p className="mt-1 text-sm text-muted">Finished films and story concepts remain separate submission types.</p></div><Link to="/submit-film" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-[#041018]">+ New submission</Link></div>
                  <TitleSearchWorkspace />
                </section>
              ) : null}

              {active === "vault" ? (
                <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Private evidence</p><h2 className="mt-1 font-display text-2xl font-semibold">Document Vault</h2><p className="mt-1 text-sm text-muted">Uploading or linking evidence does not itself approve ownership or rights.</p></div><CreatorDocumentVault /></section>
              ) : null}

              {active === "dit" ? (
                <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Media operations</p><h2 className="mt-1 font-display text-2xl font-semibold">Studio DIT Agent</h2><p className="mt-1 text-sm text-muted">Primary and Recovery object verification is required before DIT sign-off.</p></div><DitAgentDesk actor={actor} /></section>
              ) : null}

              {active === "team" ? (
                <section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Organization access</p><h2 className="mt-1 font-display text-2xl font-semibold">Team & Account</h2><p className="mt-1 text-sm text-muted">Roster is read-only for verified Studio owners and administrators. Role changes are not enabled here.</p></div><StudioMemberDesk /><Link to="/account" className="inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold">Open Account settings</Link></section>
              ) : null}
            </div>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function Kpi({label,value,detail}:{label:string;value:string;detail:string}) {
  return <article className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></article>;
}

function ActionCard({title,text,onClick}:{title:string;text:string;onClick:()=>void}) {
  return <button type="button" onClick={onClick} className="rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-accent"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted">{text}</p></button>;
}

function Retry({message,onRetry}:{message:string;onRetry:()=>void}) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-accent"><span>{message}</span><button type="button" onClick={onRetry} className="font-semibold underline">Retry</button></div>;
}

function TitleSearchWorkspace() {
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("ALL");
  const [language,setLanguage]=useState("ALL");
  const [kind,setKind]=useState<"film"|"concept">("film");
  const titlesQ=useQuery({queryKey:["bridge-titles"],queryFn:()=>listTitles()});
  const titles=titlesQ.data?.titles ?? [];
  const filtered=titles.filter((t)=>{
    const isConcept=t.submissionType==="story_concept";
    if(kind==="film" && isConcept) return false;
    if(kind==="concept" && !isConcept) return false;
    if(status!=="ALL" && t.status!==status) return false;
    if(language!=="ALL" && t.language!==language) return false;
    if(query.trim() && !t.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });
  const languages=Array.from(new Set(titles.map(t=>t.language).filter(Boolean))).sort();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        <button type="button" onClick={()=>setKind("film")} className={`rounded-full px-4 py-2 text-sm font-semibold ${kind==="film"?"bg-fg text-bg":"border border-line text-muted"}`}>Finished Films</button>
        <button type="button" onClick={()=>setKind("concept")} className={`rounded-full px-4 py-2 text-sm font-semibold ${kind==="concept"?"bg-fg text-bg":"border border-line text-muted"}`}>Story Concepts</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1fr)_180px_180px]">
        <input aria-label="Search by title" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search titles…" className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm"/>
        <select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm"><option value="ALL">All statuses</option>{["PREPARING","UPLOADING","DRAFT","QC_REVIEW","PENDING"].map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select>
        <select aria-label="Filter by language" value={language} onChange={e=>setLanguage(e.target.value)} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm"><option value="ALL">All languages</option>{languages.map(l=><option key={l} value={l}>{l}</option>)}</select>
      </div>
      {titlesQ.isPending ? <p className="text-sm text-muted">Loading titles…</p> : titlesQ.isError ? <Retry message="Could not load titles." onRetry={()=>void titlesQ.refetch()}/> : !filtered.length ? <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">No {kind==="film"?"finished films":"story concepts"} match these filters.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full min-w-[580px] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type / Language</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-line">{filtered.map(t=><tr key={t.id}><td className="px-4 py-3 font-semibold">{t.name}{t.year? <span className="ml-2 text-xs font-normal text-muted">{t.year}</span>:null}</td><td className="px-4 py-3 text-muted">{kind==="concept"?"Story Concept":t.contentType} · {t.language}</td><td className="px-4 py-3"><span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{t.status.replaceAll("_"," ")}</span></td><td className="px-4 py-3 text-right"><Link to="/title/$id" params={{id:t.id}} className="font-semibold text-accent hover:underline">Manage →</Link></td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}
