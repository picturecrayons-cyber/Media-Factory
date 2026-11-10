import { useRef, useState } from "react";

type OrderResult = { orderId: string; amountPaise: number; currency: "INR"; keyId: string };
type VerifyResult = { verified: boolean; receiptId: string };
type Props = {
  createOrder: (idempotencyKey: string) => Promise<OrderResult>;
  verifyPayment: (payload: { orderId: string; paymentId: string; signature: string }) => Promise<VerifyResult>;
  productName?: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const styles: Record<string, React.CSSProperties> = {
  panel: { border: "1px solid rgba(148,163,184,.25)", borderRadius: 18, padding: 20, background: "rgba(15,23,42,.55)", color: "inherit" },
  button: { border: 0, borderRadius: 10, padding: "12px 18px", fontWeight: 700, cursor: "pointer", background: "linear-gradient(100deg,#8b5cf6,#4f46e5)", color: "white" },
  secondary: { border: "1px solid rgba(148,163,184,.35)", borderRadius: 10, padding: "10px 14px", background: "transparent", color: "inherit", cursor: "pointer" },
  muted: { opacity: .72, fontSize: 13 },
  preview: { display: "block", width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 12, backgroundColor: "#20202b", backgroundImage: "linear-gradient(45deg,#343442 25%,transparent 25%),linear-gradient(-45deg,#343442 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#343442 75%),linear-gradient(-45deg,transparent 75%,#343442 75%)", backgroundSize: "20px 20px", backgroundPosition: "0 0,0 10px,10px -10px,-10px 0" },
};

let checkoutScriptPromise: Promise<void> | null = null;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { checkoutScriptPromise = null; reject(new Error("Could not load secure payment checkout.")); };
      document.head.appendChild(script);
    });
  }
  return checkoutScriptPromise;
}

function randomKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `logo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function LogoBackgroundConverter({ createOrder, verifyPayment, productName = "Logo Background Converter" }: Props) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [fileName, setFileName] = useState("logo-transparent.png");
  const [tolerance, setTolerance] = useState(36);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload a PNG, JPG or WebP logo to begin.");
  const [output, setOutput] = useState<Blob | null>(null);
  const [sample, setSample] = useState<number[][]>([]);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLImageElement | null>(null);

  function clearUrls() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setSourceUrl("");
    setResultUrl("");
    setOutput(null);
  }

  async function processImage(img: HTMLImageElement, colors: number[][], threshold: number) {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height || width * height > 24_000_000) throw new Error("Image is too large. Please use an image under 24 megapixels.");
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Image processor is not ready.");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Your browser could not start the image processor.");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
    const frame = ctx.getImageData(0, 0, width, height);
    const pixels = frame.data;
    const count = width * height;
    const visited = new Uint8Array(count);
    const queue = new Int32Array(count);
    let head = 0;
    let tail = 0;
    const limit = threshold * threshold * 3;
    const matches = (index: number) => {
      const offset = index * 4;
      if (pixels[offset + 3] === 0) return true;
      return colors.some(([r, g, b]) => {
        const dr = pixels[offset] - r, dg = pixels[offset + 1] - g, db = pixels[offset + 2] - b;
        return dr * dr + dg * dg + db * db <= limit;
      });
    };
    const add = (index: number) => {
      if (index < 0 || index >= count || visited[index] || !matches(index)) return;
      visited[index] = 1;
      queue[tail++] = index;
    };
    for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
    for (let y = 1; y < height - 1; y++) { add(y * width); add(y * width + width - 1); }
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      if (x > 0) add(index - 1);
      if (x + 1 < width) add(index + 1);
      if (index >= width) add(index - width);
      if (index + width < count) add(index + width);
    }
    for (let i = 0; i < count; i++) if (visited[i]) pixels[i * 4 + 3] = 0;
    ctx.putImageData(frame, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not export transparent PNG.")), "image/png"));
    setOutput(blob);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(URL.createObjectURL(blob));
    setImageSize({ width, height });
    setMessage("Background removed. Click the original preview to sample a different background colour if needed.");
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setMessage("Please choose a PNG, JPG or WebP image."); return; }
    if (file.size > 12 * 1024 * 1024) { setMessage("Please choose an image smaller than 12 MB."); return; }
    clearUrls();
    setBusy(true);
    setMessage("Processing locally in your browser…");
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setFileName(file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") + "-transparent.png");
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      originalRef.current = img;
      const w = img.naturalWidth, h = img.naturalHeight;
      const scratch = document.createElement("canvas");
      scratch.width = w; scratch.height = h;
      const context = scratch.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not read the image.");
      context.drawImage(img, 0, 0);
      const d = context.getImageData(0, 0, w, h).data;
      const points = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
      const colors = points.map(([x,y]) => { const i=(y*w+x)*4; return [d[i],d[i+1],d[i+2]]; });
      setSample(colors);
      await processImage(img, colors, tolerance);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not process this image.");
    } finally { setBusy(false); }
  }

  async function resample(event: React.MouseEvent<HTMLImageElement>) {
    const img = originalRef.current;
    if (!img || !imageRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(img.naturalWidth - 1, Math.floor((event.clientX - rect.left) / rect.width * img.naturalWidth)));
    const y = Math.max(0, Math.min(img.naturalHeight - 1, Math.floor((event.clientY - rect.top) / rect.height * img.naturalHeight)));
    const scratch = document.createElement("canvas"); scratch.width = img.naturalWidth; scratch.height = img.naturalHeight;
    const context = scratch.getContext("2d", { willReadFrequently: true }); if (!context) return;
    context.drawImage(img, 0, 0);
    const d = context.getImageData(x, y, 1, 1).data;
    const colors = [[d[0],d[1],d[2]]]; setSample(colors);
    setBusy(true);
    try { await processImage(img, colors, tolerance); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not process this image."); } finally { setBusy(false); }
  }

  async function changeTolerance(value: number) {
    setTolerance(value);
    if (!originalRef.current || !sample.length) return;
    setBusy(true);
    try { await processImage(originalRef.current, sample, value); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not process this image."); } finally { setBusy(false); }
  }

  async function payAndDownload() {
    if (!output || busy) return;
    setBusy(true);
    setMessage("Preparing secure ₹1 payment…");
    try {
      await loadCheckout();
      const order = await createOrder(randomKey());
      if (!window.Razorpay) throw new Error("Secure checkout is unavailable.");
      const checkout = new window.Razorpay({
        key: order.keyId, amount: order.amountPaise, currency: order.currency,
        name: "StreamVista", description: productName, order_id: order.orderId,
        theme: { color: "#7c3aed" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            setMessage("Verifying payment securely…");
            const verified = await verifyPayment({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
            if (!verified.verified) throw new Error("Payment verification was not confirmed.");
            const link = document.createElement("a");
            link.href = URL.createObjectURL(output);
            link.download = fileName;
            document.body.appendChild(link); link.click(); link.remove();
            setMessage(`Payment verified. Your transparent PNG has downloaded. Receipt: ${verified.receiptId}`);
          } catch (error) { setMessage(error instanceof Error ? error.message : "Payment verification failed. Contact support before retrying."); }
          finally { setBusy(false); }
        },
        modal: { ondismiss: () => { setBusy(false); setMessage("Payment was cancelled. Your image remains ready; no download was started."); } },
      });
      checkout.open();
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Payment could not be started.");
    }
  }

  return (
    <section style={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "start" }}>
        <div><p style={{ ...styles.muted, letterSpacing: 2, textTransform: "uppercase" }}>Creator utility</p><h2 style={{ fontSize: 24, fontWeight: 750, margin: "6px 0" }}>Logo Background Converter</h2><p style={styles.muted}>Remove a flat or checkerboard background. Processing stays on this device.</p></div>
        <span style={{ border: "1px solid rgba(167,139,250,.5)", borderRadius: 999, padding: "6px 10px", fontSize: 12 }}>₹1 per download</span>
      </div>
      <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <label style={styles.button}>Choose logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} style={{ display: "none" }} /></label>
        <button type="button" style={styles.secondary} onClick={() => { clearUrls(); originalRef.current = null; setMessage("Upload a PNG, JPG or WebP logo to begin."); }}>Reset</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 18 }}>
        <div><p style={styles.muted}>Original · click background to sample</p>{sourceUrl ? <img ref={imageRef} src={sourceUrl} onClick={resample} alt="Original logo" style={{ ...styles.preview, cursor: "crosshair" }} /> : <div style={{ ...styles.preview, minHeight: 160, display: "grid", placeItems: "center", padding: 20, boxSizing: "border-box" }}>Original preview</div>}</div>
        <div><p style={styles.muted}>Transparent PNG preview</p>{resultUrl ? <img src={resultUrl} alt="Transparent logo preview" style={styles.preview} /> : <div style={{ ...styles.preview, minHeight: 160, display: "grid", placeItems: "center", padding: 20, boxSizing: "border-box" }}>PNG preview</div>}</div>
      </div>
      <div style={{ marginTop: 18 }}>
        <label style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}><span>Background tolerance</span><strong>{tolerance}</strong></label>
        <input type="range" min="0" max="100" value={tolerance} onChange={(e) => void changeTolerance(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
        <p style={styles.muted}>Higher values remove more colour variation. If the wrong area is removed, click the correct background colour in the original image.</p>
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <button type="button" style={{ ...styles.button, opacity: !output || busy ? .55 : 1 }} disabled={!output || busy} onClick={() => void payAndDownload()}>{busy ? "Please wait…" : "Pay ₹1 & download PNG"}</button>
        <span role="status" aria-live="polite" style={styles.muted}>{message}</span>
      </div>
      <p style={{ ...styles.muted, marginTop: 14 }}>Images are processed in your browser and are not uploaded to our servers. Payment is verified server-side before the PNG download is released. Maximum file size 12 MB.</p>
    </section>
  );
}
