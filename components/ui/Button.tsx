import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gold text-[#1a1003] font-semibold shadow-[0_0_28px_-6px_rgb(255_181_71/0.6)] hover:bg-gold-light hover:shadow-[0_0_36px_-4px_rgb(255_181_71/0.75)] disabled:bg-gold/35 disabled:text-[#1a1003]/70 disabled:shadow-none",
  outline:
    "border border-gold/45 text-gold hover:border-gold/80 hover:bg-gold/[0.09] hover:shadow-[0_0_24px_-8px_rgb(255_181_71/0.6)] disabled:border-gold/20 disabled:text-gold/40 disabled:hover:bg-transparent disabled:hover:shadow-none",
  ghost:
    "border border-white/[0.1] text-cluster/75 hover:border-gold/35 hover:text-gold disabled:text-cluster/30 disabled:hover:border-white/[0.1]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-[12px]",
  md: "h-10 px-5 text-[13.5px]",
  lg: "h-12 px-7 text-[15px]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "primary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full tracking-[0.01em] transition-[background-color,border-color,color,box-shadow,opacity] duration-300 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-3 animate-spin rounded-full border border-current border-t-transparent", className)}
    />
  );
}
