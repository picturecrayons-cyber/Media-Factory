import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-[0_10px_24px_rgba(8,184,232,.22)] hover:bg-accent-strong",
  ghost: "bg-accent-soft text-fg hover:bg-accent-soft/70",
  outline: "border border-line-strong bg-surface text-fg hover:bg-accent-soft",
  danger: "border border-line-strong bg-surface text-fg hover:bg-fg/5",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-[transform,background-color,filter,box-shadow] duration-150 active:scale-[0.98] disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
