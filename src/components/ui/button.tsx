import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "default" | "sm" | "lg";

const styles: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-[0_10px_24px_rgba(8,184,232,.22)] hover:bg-accent-strong",
  ghost: "bg-accent-soft text-fg hover:bg-accent-soft/70",
  outline: "border border-line-strong bg-surface text-fg hover:bg-accent-soft",
  danger: "border border-line-strong bg-surface text-fg hover:bg-fg/5",
};

const sizeStyles: Record<Size, string> = {
  default: "h-11 min-h-11 px-5 text-sm",
  sm: "h-9 min-h-9 px-3.5 text-xs",
  lg: "h-12 min-h-12 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[transform,background-color,filter,box-shadow] duration-150 active:scale-[0.98] disabled:opacity-50",
        sizeStyles[size],
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
