import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createStreamVistaOrder, listStreamVistaOrders, requestStreamVistaUpload, confirmStreamVistaUpload } from "@/lib/bridge/streamvista";

const services = ["dubbing", "localization", "accessibility", "finishing", "delivery_qc", "marketing"] as const;

export function StreamVistaOrders() {
  const qc = useQueryClient();
  const [service, setService] = useState<(typeof services)[number]>("localization");
  const [lane, setLane] = useState<"self_service" | "managed">("managed");
  const [uploading, setUploading] = useState<string | null>(null);
  const ordersQ = useQuery({ queryKey: ["streamvista-orders"], queryFn: () => listStreamVistaOrders() });
  const create = useMutation({
    mutationFn: () => createStreamVistaOrder({ data: { service, lane } }),
    onSuccess: () => { toast("Service request created"); void qc.invalidateQueries({ queryKey: ["streamvista-orders"] }); },
    onError: (error) => toast(error instanceof Error ? error.message : "Request failed"),
  });

  async function upload(orderId: string, file: File | undefined) {
    if (!file) return;
    setUploading(orderId);
    try {
      const signed = await requestStreamVistaUpload({ data: { orderId, filename: file.name, contentType: file.type || "application/octet-stream" } });
      const result = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!result.ok) throw new Error(`Storage upload failed (${result.status})`);
      await confirmStreamVistaUpload({ data: { orderId, key: signed.key } });
      toast("Source upload verified in storage");
      await qc.invalidateQueries({ queryKey: ["streamvista-orders"] });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-line bg-surface p-6 md:p-8">
      <h2 className="font-display text-2xl">StreamVista production services</h2>
      <p className="mt-2 text-sm text-muted">Request a production service and securely upload its source. QC approval and Bridge distribution remain separate steps.</p>
      <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate(); }}>
        <label className="text-sm">Service
          <select className="mt-1 block h-11 rounded-sm border border-line bg-elevated px-3" value={service} onChange={(event) => setService(event.target.value as typeof service)}>
            {services.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-sm">Support
          <select className="mt-1 block h-11 rounded-sm border border-line bg-elevated px-3" value={lane} onChange={(event) => setLane(event.target.value as typeof lane)}>
            <option value="self_service">Self service</option><option value="managed">Managed review</option>
          </select>
        </label>
        <Button type="submit" disabled={create.isPending}>Create request</Button>
      </form>
      {ordersQ.isError && <p role="alert" className="mt-4 text-sm text-accent">Could not load requests. <Button type="button" onClick={() => void ordersQ.refetch()}>Retry</Button></p>}
      {ordersQ.isPending && <p className="mt-4 text-sm text-muted">Loading requests…</p>}
      {ordersQ.data?.orders.length === 0 && <p className="mt-4 text-sm text-muted">No service requests yet.</p>}
      <ul className="mt-4 space-y-3">
        {ordersQ.data?.orders.map((order) => (
          <li key={order.id} className="rounded-sm border border-line p-4">
            <p className="font-medium">{order.service.replaceAll("_", " ")} · {order.status.replaceAll("_", " ")}</p>
            <p className="mt-1 text-xs text-muted">Request {order.id}</p>
            {order.source_s3_key ? <p className="mt-2 text-sm">Source verified in private storage</p> : order.status === "requested" ? (
              <label className="mt-3 block text-sm">Upload source
                <input type="file" disabled={uploading === order.id} className="mt-1 block w-full text-sm" onChange={(event) => { void upload(order.id, event.target.files?.[0]); event.target.value = ""; }} />
              </label>
            ) : null}
            {order.bridge_title_id && <p className="mt-2 text-sm">Bridge title: {order.bridge_title_id}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
