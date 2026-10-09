import { BadgeCheck, LockKeyhole } from "lucide-react";

type SlateTitle = {
  priority: "P1" | "P2" | "P3";
  title: string;
  language: string;
  year: string;
  record: string;
  note: string;
};

const slate: SlateTitle[] = [
  { priority: "P1", title: "Jananam 1947 Pranayam Thudarunnu", language: "Malayalam", year: "2024", record: "legacy-film-7", note: "Existing LIVE_FOR_BUYERS status; related asset, rights, legal and QC evidence counts were zero in the audit. Block availability until verified. Two additional title candidates need identity review." },
  { priority: "P1", title: "The Protector", language: "Malayalam", year: "Unknown", record: "Not matched", note: "Canonical record not yet identified by the targeted audit." },
  { priority: "P1", title: "Koodal", language: "Malayalam", year: "Unknown", record: "Not matched", note: "Canonical record not yet identified by the targeted audit." },
  { priority: "P1", title: "Vaathil", language: "Malayalam", year: "Unknown", record: "Not matched", note: "Canonical record not yet identified by the targeted audit." },
  { priority: "P1", title: "Bahumukham — Good, Bad & The Actor", language: "Telugu", year: "2024", record: "legacy-film-37", note: "DRAFT; master/poster keys absent in the audited row; evidence tables had no linked rows." },
  { priority: "P2", title: "Jamalinte Punchiri (Jamal’s Smile)", language: "Malayalam", year: "2024", record: "legacy-film-56", note: "DRAFT; master/poster keys absent in the audited row; evidence tables had no linked rows." },
  { priority: "P2", title: "Imran (DB title: Imran 3:185)", language: "Unverified", year: "Unknown", record: "legacy-film-47", note: "DRAFT; language and title identity need confirmation." },
  { priority: "P2", title: "Jami", language: "Malayalam (slate)", year: "Unknown", record: "legacy-film-67", note: "DRAFT; database language is empty. Confirm identity and language." },
  { priority: "P2", title: "Pranayam 1947 — Telugu dub", language: "Telugu", year: "Unverified", record: "8dd48865… / legacy-film-36", note: "Two candidate rows; keep separate from Malayalam original until dub/version rights and canonical identity are verified." },
  { priority: "P3", title: "Malayalakkara Residency", language: "Malayalam", year: "2014", record: "858f0ec5…", note: "DRAFT; master/poster keys absent in the audited row; evidence tables had no linked rows." },
  { priority: "P3", title: "Aandaal", language: "Malayalam (slate)", year: "Unknown", record: "legacy-film-55 / legacy-film-54 / ee89fc64…", note: "Three candidate rows. No merge or deletion without identity evidence." },
  { priority: "P3", title: "Isha (DB title: ISHA-Malayalam Horror)", language: "Unverified", year: "Unknown", record: "legacy-film-66", note: "DRAFT; language and canonical identity need confirmation." },
  { priority: "P3", title: "Anjaam Vedham", language: "Malayalam (slate)", year: "Unknown", record: "Not matched", note: "Canonical record not yet identified by the targeted audit." },
  { priority: "P3", title: "Soochana", language: "Malayalam (slate)", year: "Unknown", record: "Not matched", note: "Canonical record not yet identified by the targeted audit." },
  { priority: "P3", title: "Gods Frequency", language: "Hindi series (slate)", year: "Unknown", record: "Not matched", note: "Canonical record not yet identified. Confirm series/season/episode structure before availability." },
  { priority: "P3", title: "Kombal", language: "Malayalam (slate)", year: "Unknown", record: "legacy-film-53", note: "DRAFT; language and canonical identity need confirmation." },
];

const priorityStyle: Record<SlateTitle["priority"], string> = {
  P1: "border-amber-500/40 text-amber-700",
  P2: "border-line text-muted",
  P3: "border-line text-muted",
};

export function AdminOnlyTitleSlate() {
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="admin-title-slate">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-line p-3"><LockKeyhole aria-hidden="true" className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Admin-only · Not buyer-facing</p>
          <h2 id="admin-title-slate" className="mt-1 font-display text-2xl font-semibold">16-title intake & reconciliation slate</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Intake register only—not canonical title records or rights clearance. Match each candidate to Bridge evidence before creating or merging records. Unknown evidence stays blocked; this panel does not publish to buyers or Loop.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["P1", "P2", "P3"] as const).map((priority) => (
          <div key={priority} className="rounded-xl border border-line p-3">
            <p className="text-xs text-muted">{priority} review priority</p>
            <p className="mt-1 text-xl font-semibold">{slate.filter((item) => item.priority === priority).length} titles</p>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {slate.map((item) => (
          <li key={item.title} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityStyle[item.priority]}`}>{item.priority}</span>
                <h3 className="font-medium text-fg">{item.title}</h3>
              </div>
              <p className="mt-1 text-xs text-muted">{item.language} · {item.year} · Candidate record: <span className="font-mono">{item.record}</span></p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.note}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-muted"><LockKeyhole aria-hidden="true" className="h-3 w-3" /> Intake only</span>
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted"><BadgeCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> Next gate: verify canonical identity, assets, rights, QC and legal evidence; only then create/update canonical records through the authorized Bridge workflow. No buyer outreach is sent from this slate.</p>
    </section>
  );
}
