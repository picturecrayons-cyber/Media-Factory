import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listTitles } from "@/lib/bridge/titles";
import {
  listDitOperations, createDitProduction, createDitCameraCard, prepareDitClipUpload,
  verifyAndReplicateDitClip, queueDitConversion, reviewDitClip, signoffDitCard,
} from "@/lib/bridge/dit-operations.server";
import { hashFileSha256 } from "@/lib/bridge/sha256-stream";

type DitWorkspaceProps = { canReview: boolean };
type DitCard = {
  id: string; title_id: string; titleName: string; productionName: string; productionNo: string;
  shootingDayId: string; shootingDate: string; cameraCardId: string; cameraId: string; cardNo: string;
  cardState: string; clipCount: number; clips?: Array<{ id: string; clipNumber: string; automatedResult: string; humanDisposition: string | null }>;
};

function uploadWithProgress(url: string, file: File, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`OCI upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("OCI upload network error"));
    xhr.onabort = () => reject(new Error("OCI upload cancelled"));
    xhr.send(file);
  });
}

export function DitWorkspace({ canReview }: DitWorkspaceProps) {
  const qc = useQueryClient();
  const titlesQuery = useQuery({ queryKey: ["dit-title-options"], queryFn: () => listTitles() });
  const ditQuery = useQuery({ queryKey: ["dit-operations"], queryFn: () => listDitOperations({ data: {} }) });
  const [titleId, setTitleId] = useState("");
  const [productionName, setProductionName] = useState("");
  const [productionNo, setProductionNo] = useState("");
  const [shootingDate, setShootingDate] = useState(new Date().toISOString().slice(0, 10));
  const [productionId, setProductionId] = useState("");
  const [shootingDayId, setShootingDayId] = useState("");
  const [cameraId, setCameraId] = useState<"A" | "B" | "C">("A");
  const [cardNo, setCardNo] = useState("");
  const [cameraCardId, setCameraCardId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [clipNumber, setClipNumber] = useState("001");
  const [relativePath, setRelativePath] = useState("");
  const [codec, setCodec] = useState("ProRes RAW");
  const [frameRate, setFrameRate] = useState("24");
  const [hasAudio, setHasAudio] = useState(true);
  const [durationMs, setDurationMs] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [resolution, setResolution] = useState<"720p" | "1080p">("1080p");
  const [outputType, setOutputType] = useState<"Proxy" | "ProRes">("Proxy");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const titles = titlesQuery.data?.titles ?? [];
  const cards = (ditQuery.data ?? []) as DitCard[];
  const selectedTitle = titles.find((item: any) => item.id === titleId);
  const selectedProduction = cards.find((item) => item.id === productionId);
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["dit-operations"] }),
      qc.invalidateQueries({ queryKey: ["dit-title-options"] }),
    ]);
  };

  async function createProduction() {
    setError(""); setStatus("");
    if (!titleId || !productionNo.trim() || !shootingDate) { setError("Select a title and enter production number/date."); return; }
    setBusy(true);
    try {
      const result = await createDitProduction({ data: {
        titleId, productionName: productionName.trim() || selectedTitle?.name || "Production",
        productionNo: productionNo.trim(), shootingDate,
      } });
      setProductionId(result.productionId);
      setShootingDayId(result.shootingDayId);
      setStatus("Production workspace created in the explicitly bound STAGING DB.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Production creation failed"); }
    finally { setBusy(false); }
  }

  async function createCard() {
    setError(""); setStatus("");
    if (!productionId || !shootingDayId || !cardNo.trim()) { setError("Select production/day and enter the physical card number."); return; }
    setBusy(true);
    try {
      const result = await createDitCameraCard({ data: { productionId, shootingDayId, cameraId, cardNo: cardNo.trim() } });
      setCameraCardId(result.cameraCardId);
      setStatus(`Camera ${cameraId} card ${cardNo} registered.`);
      setCardNo("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Camera card creation failed"); }
    finally { setBusy(false); }
  }

  async function selectFile(next: File | null) {
    setFile(next);
    setProgress(0);
    if (!next) return;
    setRelativePath(next.name);
    try {
      const url = URL.createObjectURL(next);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        setDurationMs(Math.round(video.duration * 1000));
        setWidth(video.videoWidth);
        setHeight(video.videoHeight);
        URL.revokeObjectURL(url);
      };
      video.onerror = () => URL.revokeObjectURL(url);
      video.src = url;
    } catch { /* Metadata remains editable below. */ }
  }

  async function ingestClip() {
    setError(""); setStatus(""); setProgress(0);
    if (!file || !productionId || !shootingDayId || !cameraCardId) {
      setError("Create/select a production and camera card, then choose a clip."); return;
    }
    if (!durationMs || !width || !height || !frameRate || !codec.trim() || !relativePath.trim()) {
      setError("Clip duration, frame size, frame rate, codec and original relative path are required."); return;
    }
    setBusy(true);
    try {
      setStatus("Calculating streaming SHA-256 in 8 MB chunks…");
      const checksumSha256 = await hashFileSha256(file, (loaded, total) => setProgress(Math.round(loaded / total * 25)));
      const prepared = await prepareDitClipUpload({ data: {
        productionId, shootingDayId, cameraCardId,
        clip: {
          clipNumber: clipNumber.trim(), originalFilename: file.name, originalRelativePath: relativePath.trim(),
          byteSize: file.size, checksumSha256, hasVideo: true, hasAudio, durationMs,
          frameRate: Number(frameRate), width, height, codec: codec.trim(),
        },
      } });
      setStatus("Uploading original to OCI MASTER…");
      await uploadWithProgress(prepared.uploadUrl, file, (value) => setProgress(25 + Math.round(value * 0.5)));
      setStatus("Reading MASTER back, calculating SHA-256 and replicating to two separate OCI regions…");
      const verified = await verifyAndReplicateDitClip({ data: { productionId, manifestId: prepared.manifestId, clipId: prepared.clipId } });
      setProgress(verified.verified ? 85 : 75);
      if (!verified.verified) throw new Error("Replica verification failed. The card has been quarantined; do not reuse it.");
      setStatus("Queueing approved conversion profile…");
      const job = await queueDitConversion({ data: { clipId: prepared.clipId, resolution, outputType } });
      setProgress(100);
      setStatus(`RAW verified in three regions. Conversion job ${job.jobId} is queued for the local FFmpeg worker.`);
      setFile(null);
      setCameraCardId("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "DIT ingest failed");
      setStatus("");
    } finally { setBusy(false); }
  }

  async function reviewClip(clipId: string, decision: "ACCEPTED" | "REJECTED") {
    setError(""); setStatus("");
    try {
      await reviewDitClip({ data: { clipId, decision, note: decision === "ACCEPTED" ? "DIT integrity and technical evidence reviewed." : "DIT reviewer rejected this clip; quarantine required." } });
      setStatus(`Clip review recorded: ${decision}.`);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Clip review failed"); }
  }

  async function signoff(card: DitCard) {
    setError(""); setStatus("");
    try {
      const result = await signoffDitCard({ data: { productionId: card.id, shootingDayId: card.shootingDayId, cameraCardId: card.cameraCardId } });
      setStatus(result.eligible ? "DIT sign-off passed. Card is safe to reuse." : `DIT sign-off blocked: ${result.blockers.join("; ")}`);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "DIT sign-off failed"); }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-surface p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio Production Vault · DIT</p>
        <h2 className="mt-1 text-xl font-semibold">Production ingest and card safety</h2>
        <p className="mt-1 text-sm text-muted">Original upload → SHA-256 read-back → MASTER + two regional replicas → conversion queue → independent DIT sign-off. Uploads and database writes are blocked unless the server confirms the approved STAGING DB.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm"><span>Title</span>
          <select className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={titleId} onChange={(e) => { setTitleId(e.target.value); const item = titles.find((t: any) => t.id === e.target.value); setProductionName(item?.name ?? ""); }}>
            <option value="">Choose a title…</option>{titles.map((item: any) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span>Production number</span><input className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={productionNo} onChange={(e) => setProductionNo(e.target.value)} placeholder="e.g. MR-2026-01"/></label>
        <label className="space-y-1 text-sm"><span>Production name</span><input className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={productionName} onChange={(e) => setProductionName(e.target.value)} placeholder="Defaults to title name"/></label>
        <label className="space-y-1 text-sm"><span>Shooting date</span><input type="date" className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={shootingDate} onChange={(e) => setShootingDate(e.target.value)}/></label>
      </div>
      <button type="button" disabled={busy || !titleId} onClick={createProduction} className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">Create production workspace</button>

      <div className="grid gap-3 border-t border-line pt-4 md:grid-cols-4">
        <label className="space-y-1 text-sm md:col-span-2"><span>Production / shooting day</span>
          <select className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={productionId} onChange={(e) => { const item = cards.find((c) => c.id === e.target.value); setProductionId(e.target.value); setShootingDayId(item?.shootingDayId ?? ""); setCameraCardId(""); }}>
            <option value="">Choose production…</option>{Array.from(new Map(cards.map((c) => [c.id, c])).values()).map((c) => <option key={c.id} value={c.id}>{c.titleName} · {c.productionNo} · Day {c.dayNumber}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span>Camera</span><select className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={cameraId} onChange={(e) => setCameraId(e.target.value as "A" | "B" | "C")}><option>A</option><option>B</option><option>C</option></select></label>
        <label className="space-y-1 text-sm"><span>Physical card no.</span><input className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={cardNo} onChange={(e) => setCardNo(e.target.value)} placeholder="CARD-01"/></label>
      </div>
      <button type="button" disabled={busy || !productionId || !cardNo.trim()} onClick={createCard} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">Register camera card</button>

      <div className="border-t border-line pt-4">
        <h3 className="font-semibold">Ingest a video clip</h3>
        <p className="mt-1 text-xs text-muted">Browser hashes the file in chunks before upload. Video metadata is read from the file; codec and frame rate must be checked against the camera report. A failed replica check quarantines the card.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm"><span>Video file</span><input type="file" accept="video/*,.mov,.mxf,.mp4" disabled={busy} onChange={(e) => void selectFile(e.target.files?.[0] ?? null)} className="block w-full text-xs"/></label>
          <label className="space-y-1 text-sm"><span>Clip number</span><input className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={clipNumber} onChange={(e) => setClipNumber(e.target.value)}/></label>
          <label className="space-y-1 text-sm"><span>Original relative path</span><input className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={relativePath} onChange={(e) => setRelativePath(e.target.value)}/></label>
          <label className="space-y-1 text-sm"><span>Codec (camera report)</span><select className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={codec} onChange={(e) => setCodec(e.target.value)}><option>ProRes RAW</option><option>Apple ProRes 422 HQ</option><option>Apple ProRes 422</option><option>H.264</option><option>H.265 / HEVC</option><option>DNxHR</option></select></label>
          <label className="space-y-1 text-sm"><span>Frame rate</span><input type="number" min="1" max="240" step="0.001" className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={frameRate} onChange={(e) => setFrameRate(e.target.value)}/></label>
          <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={hasAudio} onChange={(e) => setHasAudio(e.target.checked)}/> Audio stream present</label>
        </div>
        <p className="mt-2 text-xs text-muted">{file ? `${file.name} · ${(file.size / (1024 ** 3)).toFixed(2)} GiB · ${width}×${height} · ${(durationMs / 1000).toFixed(1)} sec` : "No file selected"}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span>Conversion resolution</span><select className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={resolution} onChange={(e) => setResolution(e.target.value as "720p" | "1080p")}><option>720p</option><option>1080p</option></select></label>
          <label className="space-y-1 text-sm"><span>Conversion output</span><select className="w-full rounded-lg border border-line bg-bg px-3 py-2" value={outputType} onChange={(e) => setOutputType(e.target.value as "Proxy" | "ProRes")}><option>Proxy</option><option>ProRes</option></select></label>
        </div>
        <button type="button" disabled={busy || !file || !cameraCardId} onClick={ingestClip} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Hash · Upload · Verify · Replicate · Queue conversion</button>
        {busy ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated"><div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }}/></div> : null}
        {status ? <p className="mt-2 text-sm text-muted">{status}</p> : null}
        {error ? <p role="alert" className="mt-2 rounded-lg border border-red-500/30 p-3 text-sm text-red-500">{error}</p> : null}
      </div>

      <div className="border-t border-line pt-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Production cards and clip ledger</h3><button type="button" onClick={() => void refresh()} className="text-xs text-accent">Refresh</button></div>
        {ditQuery.isLoading ? <p className="mt-3 text-sm text-muted">Loading DIT records…</p> : ditQuery.isError ? <p className="mt-3 text-sm text-red-500">DIT schema or STAGING binding is unavailable. No data is fabricated.</p> : !cards.length ? <p className="mt-3 text-sm text-muted">No DIT production records yet.</p> : <div className="mt-3 space-y-3">{cards.map((card) => (
          <div key={card.cameraCardId} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{card.titleName} · {card.productionNo}</p><p className="text-xs text-muted">Day {card.dayNumber} · Camera {card.cameraId} · {card.cardNo} · {card.cardState}</p></div>
              {canReview ? <button type="button" onClick={() => void signoff(card)} className="rounded-full border border-line px-3 py-1.5 text-xs">Evaluate DIT sign-off</button> : null}
            </div>
            {card.clips?.map((clip) => <div key={clip.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
              <span>{clip.clipNumber} · QC {clip.automatedResult} · Human {clip.humanDisposition ?? "PENDING"}</span>
              {canReview && !clip.humanDisposition ? <span className="flex gap-2"><button type="button" onClick={() => void reviewClip(clip.id, "ACCEPTED")} className="text-accent">Accept</button><button type="button" onClick={() => void reviewClip(clip.id, "REJECTED")} className="text-red-500">Reject</button></span> : null}
            </div>)}
          </div>
        ))}</div>}
      </div>
      <div className="rounded-lg bg-elevated p-3 text-xs text-muted">
        Conversion worker: install FFmpeg/FFprobe on the Studio workstation and run `node scripts/dit-worker.mjs` with `DIT_WORKER_BASE_URL`, `DIT_WORKER_TOKEN`, `DIT_WORKER_ONCE=0`. Worker access is disabled until a Preview-only token and Testing DB binding are explicitly configured. Regional copies currently use distinct OCI regions and buckets under the configured OCI tenancy; they are not yet separate-tenancy copies.
      </div>
    </section>
  );
}
