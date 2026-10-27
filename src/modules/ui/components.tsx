import type { ComponentProps, ReactNode } from "react";

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function Container({
  children,
  className,
  size = "lg",
}: {
  children: ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl";
}) {
  const sizes = { md: "max-w-3xl", lg: "max-w-4xl", xl: "max-w-7xl" };
  return <main className={classes("mx-auto w-full px-4 py-6 sm:px-6 lg:py-8", sizes[size], className)}>{children}</main>;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={classes("overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={classes("border-b border-[var(--border)] px-5 py-4 sm:px-6", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={classes("p-5 sm:p-6", className)} {...props} />;
}

export function FormField({ children, className, error }: { children: ReactNode; className?: string; error?: string }) {
  return <div className={classes("grid gap-2", className)}>{children}{error ? <p role="alert" className="text-xs leading-5 text-[var(--danger)]">{error}</p> : null}</div>;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={classes("text-base font-medium text-gray-700", className)} {...props} />;
}

type ControlProps = { error?: boolean };
// Adapted from TailAdmin InputField; native props and existing API are retained.
const controlClassName = "min-h-13 w-full rounded-lg border bg-[var(--surface)] px-4 py-3 text-base text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-60";

export function Input({ className, error, ...props }: ComponentProps<"input"> & ControlProps) {
  return <input aria-invalid={error || undefined} className={classes(controlClassName, error ? "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-red-500/15" : "border-[var(--border-strong)]", className)} {...props} />;
}

export function Select({ className, error, ...props }: ComponentProps<"select"> & ControlProps) {
  return <select aria-invalid={error || undefined} className={classes(controlClassName, "ui-select appearance-none pr-11", error ? "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-red-500/15" : "border-[var(--border-strong)]", className)} {...props} />;
}

export function Textarea({ className, error, ...props }: ComponentProps<"textarea"> & ControlProps) {
  return <textarea aria-invalid={error || undefined} className={classes("min-h-24 resize-y", controlClassName, error ? "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-red-500/15" : "border-[var(--border-strong)]", className)} {...props} />;
}

export function Checkbox({ className, label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return <label className={classes("flex min-h-13 items-center gap-3 text-sm text-gray-700", className)}><input className="size-5 shrink-0 rounded-md border-[var(--border-strong)] accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 focus:ring-3 focus:ring-[var(--accent-soft)]" type="checkbox" {...props} /><span>{label}</span></label>;
}

export function Button({ className, variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const variants = {
    primary: "border-transparent bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300",
    secondary: "border-gray-300 bg-white text-gray-700 shadow-theme-xs hover:bg-gray-50",
    danger: "border-[var(--danger)] bg-[var(--danger)] text-white hover:opacity-90",
  };
  return <button className={classes("inline-flex min-h-13 items-center justify-center gap-2 rounded-lg border px-5 py-3 text-base font-medium transition disabled:opacity-60", variants[variant], className)} {...props} />;
}

export function FormSection({ children, className, description, title }: { children: ReactNode; className?: string; description?: string; title: string }) {
  return <section className={classes("grid gap-4", className)}><div><h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>{description ? <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p> : null}</div><div className="grid gap-4 md:grid-cols-2">{children}</div></section>;
}

export function FormActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={classes("flex flex-wrap justify-end gap-3 border-t border-[var(--border)] pt-5", className)} {...props} />;
}
