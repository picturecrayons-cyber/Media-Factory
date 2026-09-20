import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PinGate({
  onValid,
  onCancel,
}: {
  onValid: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/90 p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-elevated p-6 shadow-[var(--shadow-lift)]">
        <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Parental gate</p>
        <h2 className="font-display mt-2 text-2xl tracking-wide">Exit Kids</h2>
        <p className="mt-2 text-sm text-muted">
          Enter the 4-digit parent PIN to return to main cinema. Default is 0000.
        </p>
        <input
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="mt-5 h-14 w-full rounded-md border border-line bg-bg text-center font-mono text-2xl tracking-[0.6em] outline-none focus:border-loop"
          autoFocus
        />
        {error ? <p className="mt-2 text-xs text-accent">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Stay
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              if (pin === "0000") onValid();
              else setError("Incorrect 4-digit parent PIN.");
            }}
          >
            Unlock
          </Button>
        </div>
      </div>
    </div>
  );
}
