import { createFileRoute } from "@tanstack/react-router";

const modules = [
  "Kids Catalog",
  "Hero / Featured",
  "Collections",
  "Age Bands",
  "Languages",
  "Publish / Unpublish",
  "Scheduling",
  "Artwork",
];

const adRules = [
  "Contextual kids/family ads only",
  "No behavioral child targeting",
  "Block adult categories",
  "No direct child profiling",
];

export const Route = createFileRoute("/kids-cms")({
  component: KidsCms,
});

function KidsCms() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Crayons Bridge</p>
        <h1 className="text-3xl font-black tracking-tight">LOOP KIDS CMS</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500">
          Merchandising controls for the LOOP KIDS mini-OTT. Rights, licensing and publication authority remain in Bridge.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((label) => (
          <button
            key={label}
            type="button"
            className="rounded-2xl border border-neutral-200 bg-white p-4 text-left text-sm font-semibold shadow-sm transition hover:border-violet-300 hover:shadow"
            title={label}
          >
            {label}
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-bold">Kids-safe Ads</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {adRules.map((rule) => (
            <label key={rule} className="flex items-center gap-2 rounded-xl border border-neutral-200 p-3 text-sm">
              <input type="checkbox" checked readOnly />
              <span>{rule}</span>
            </label>
          ))}
        </div>
      </section>
    </main>
  );
}
