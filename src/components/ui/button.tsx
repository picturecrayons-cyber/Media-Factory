import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110",
  ghost: "bg-fg/8 text-fg hover:bg-fg/14",
  outline: "border border-line-strong text-fg hover:bg-fg/8",
  danger: "border border-line-strong text-fg hover:bg-fg/10",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition-[transform,background-color,filter] duration-150 active:scale-[0.98] disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
