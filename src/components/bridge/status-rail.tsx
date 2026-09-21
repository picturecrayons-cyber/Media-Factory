import { TITLE_STATUS_ORDER } from "@/lib/bridge/lifecycle";
import type { TitleStatus } from "@/lib/bridge/types";
import { cn } from "@/lib/cn";

const LABELS: Record<TitleStatus, string> = {
  DRAFT: "Draft",
  UPLOADING: "Uploading",
  PREPARING: "Preparing",
  QC_REVIEW: "QC",
  RIGHTS_REVIEW: "Rights",
  LICENSING_READY: "Ready",
  LIVE_FOR_BUYERS: "Live",
  IN_NEGOTIATION: "Deal",
  LICENSED: "Licensed",
  DELIVERED: "Delivered",
};

export function StatusRail({ status }: { status: TitleStatus }) {
  const idx = TITLE_STATUS_ORDER.indexOf(status);
  return (
    <ol className="grid grid-cols-5 gap-1 sm:grid-cols-10">
      {TITLE_STATUS_ORDER.map((step, i) => {
        const done = i <= idx;
        const current = i === idx;
        return (
          <li
            key={step}
            className={cn(
              "rounded-sm border px-1 py-2 text-center",
              current ? "border-accent bg-accent/15 text-fg" : done ? "border-line-strong text-fg" : "border-line text-faint",
            )}
          >
            <span className="block font-mono text-[10px] tabular-nums tracking-wider">{String(i + 1).padStart(2, "0")}</span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.12em]">{LABELS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function StatusChip({ status }: { status: TitleStatus }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-line-strong px-2 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
      {status.replaceAll("_", " ")}
    </span>
  );
}
