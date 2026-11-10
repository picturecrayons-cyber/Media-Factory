import { useEffect, useState } from "react";
import { removeLogoBackground } from "@/lib/tools/logo-background-remover";

type ProcessedImage = { url: string; width: number; height: number };

export function LogoBackgroundRemover() {
  const [file, setFile] = useState<File | null>(null);
  const [tolerance, setTolerance] = useState(34);
  const [result, setResult] = useState<ProcessedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setOriginalUrl(null);
      setResult(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let outputUrl: string | null = null;
    setBusy(true);
    setError(null);
    setResult(null);

    const run = async () => {
      try {
        const bitmap = await createImageBitmap(file);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Your browser could not create an image canvas.");
          context.drawImage(bitmap, 0, 0);
          const source = context.getImageData(0, 0, bitmap.width, bitmap.height);
          const cleaned = removeLogoBackground(source, { tolerance });
          context.putImageData(cleaned, 0, 0);
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed.")), "image/png");
          });
          if (cancelled) return;
          outputUrl = URL.createObjectURL(blob);
          setResult({ url: outputUrl, width: bitmap.width, height: bitmap.height });
        } finally {
          bitmap.close();
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not process this image.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [file, tolerance]);

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    setError(null);
    setFile(next);
  };

  return (
    <section className="space-y-5 rounded-lg border border-line p-4 sm:p-6" aria-labelledby="logo-remover-title">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Creator tools</p>
        <h2 id="logo-remover-title" className="text-xl font-semibold">Logo Background Remover</h2>
        <p className="text-sm text-muted">Remove flat or checkerboard backgrounds and export a transparent PNG. Processing stays in this browser; your image is not uploaded.</p>
      </div>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Choose logo image</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
          className="block w-full rounded-md border border-line bg-background p-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-2"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <label htmlFor="logo-tolerance" className="font-medium">Background tolerance</label>
          <output htmlFor="logo-tolerance" className="tabular-nums text-muted">{tolerance}</output>
        </div>
        <input id="logo-tolerance" type="range" min="0" max="100" value={tolerance}
          onChange={(event) => setTolerance(Number(event.currentTarget.value))}
          className="w-full accent-current" />
        <p className="text-xs text-muted">Increase if checkerboard remains. Decrease if logo edges become transparent.</p>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-500/40 p-3 text-sm text-red-600">{error}</p>}
      {busy && <p role="status" className="text-sm text-muted">Processing image locally…</p>}

      {file && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Original</h3>
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-md border border-line bg-[linear-gradient(45deg,#d8d8d8_25%,transparent_25%),linear-gradient(-45deg,#d8d8d8_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d8d8d8_75%),linear-gradient(-45deg,transparent_75%,#d8d8d8_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] p-3">
              {originalUrl && <img src={originalUrl} alt="Original logo" className="max-h-72 max-w-full object-contain" />}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Transparent result</h3>
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-md border border-line bg-[linear-gradient(45deg,#d8d8d8_25%,transparent_25%),linear-gradient(-45deg,#d8d8d8_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d8d8d8_75%),linear-gradient(-45deg,transparent_75%,#d8d8d8_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] p-3">
              {result && <img src={result.url} alt="Logo with transparent background" className="max-h-72 max-w-full object-contain" />}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">{result.width} × {result.height} px · PNG · Transparent background</p>
          <a href={result.url} download={`${file?.name.replace(/\.[^.]+$/, "") || "logo"}-transparent.png`}
            className="inline-flex rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-background">
            Download transparent PNG
          </a>
        </div>
      )}
    </section>
  );
}
