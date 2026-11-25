import type { ReactNode } from "react";

export type WorkspaceNavItem = {
  label: string;
  href: string;
  detail?: string;
};

export function WorkspaceOs({
  eyebrow,
  title,
  description,
  items,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: WorkspaceNavItem[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-5 pb-12 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-7">
      <aside className="min-w-0 lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)] lg:self-start">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Workspace</p>
          <nav aria-label={`${eyebrow} workspace`} className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {items.map((item, index) => (
              <a
                key={item.href}
                href={item.href}
                className="group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="w-5 shrink-0 text-[10px] font-semibold tabular-nums text-faint">{String(index + 1).padStart(2, "0")}</span>
                <span className="whitespace-nowrap">{item.label}</span>
              </a>
            ))}
          </nav>
          <div className="mt-4 hidden border-t border-line px-3 pt-3 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Bridge workflow</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">Prepare. Protect. License. Deliver.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        <header className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function WorkspacePanel({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <details id={id} open={id === "overview"} className="group scroll-mt-28 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">{eyebrow}</p> : null}
          <h3 className="mt-1 font-display text-lg font-semibold">{title}</h3>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{description}</p> : null}
        </div>
        <span aria-hidden="true" className="mt-1 shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold text-muted group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-4 border-t border-line pt-4">{children}</div>
    </details>
  );
}

export function WorkspaceAction({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return (
    <a
      href={href}
      className={secondary
        ? "inline-flex min-h-10 items-center rounded-lg border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold text-fg transition hover:border-accent hover:text-accent"
        : "inline-flex min-h-10 items-center rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"}
    >
      {children}
    </a>
  );
}
