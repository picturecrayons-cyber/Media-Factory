import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StudioStorage } from "@/components/bridge/studio-storage";
import { CreateTitleForm, OwnerReport, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

function StudioDesk() {
  const [query, setQuery] = useState("");
  return (
    <div className="space-y-6">
      <CreateTitleForm defaults={{ language: "Malayalam", country: "India", contentType: "Film" }} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles" className="h-12 w-full rounded-xl border border-line-strong bg-white px-3" />
      <TitleList empty="No titles yet." query={query} />
      <OwnerReport />
      <StudioStorage />
    </div>
  );
}

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio">
          <StudioDesk />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
