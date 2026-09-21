import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger" | "loop";

const styles: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:brightness-110 shadow-[0_0_0_1px_#ffffff10]",
  ghost: "bg-fg/10 text-fg hover:bg-fg/16",
  outline: "border border-line-strong text-fg hover:bg-fg/8",
  danger: "bg-accent/90 text-accent-fg hover:bg-accent",
  loop: "bg-loop text-bg hover:brightness-110",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-[transform,background-color,filter] duration-150 active:scale-[0.98] disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
