import { useState } from "react";
import { executeFounderCommand } from "@/lib/bridge/founder-commands";

type Result = Awaited<ReturnType<typeof executeFounderCommand>>;

export function FounderCommandCentre() {
  const [command, setCommand] = useState("pending titles");
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = command.trim().toLowerCase();
  const supported = ["pending titles", "show pending titles", "list pending titles"].includes(normalized);

  async function run() {
    if (!supported || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await executeFounderCommand({ data: { command: "pending_titles" } });
      setResult(response);
      setPreview(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Command failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" aria-labelledby="founder-command-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="founder-command-heading" className="text-lg font-semibold text-white">Founder command centre</h2>
          <p className="mt-1 text-sm text-slate-400">Allowlisted, read-only commands. Every execution is checked serֻǱ˞