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
  return <main className={classes("mx-auto w-full px-4 py-6 sm:px-6", sizes[size], className)}>{children}</main>;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={classes("overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={classes("border-b border-[var(--border)] px-5 py-4 sm:px-6", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={classes("p-5 sm:p-6", className)} {...props} />;
}

export function FormField({ children, className, error }: { children: ReactNode; className?: string; error?: string }) {
  return <div className={classes("grid gap-1.5", className)}>{children}{error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}</div>;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={classes("text-sm font-medium text-[var(--text)]", className)} {...props} />;
}

type ControlProps = { error?: boolean };
const controlClassName = "min-h-11 w-full rounded-[var(--radius)] border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-muted)]";

export function Input({ className, error, ...props }: ComponentProps<"input"> & ControlProps) {
  return <input className={classes(controlClassName, error ? "border-[var(--danger)]" : "border-[var(--border-strong)]", className)} {...props} />;
}

export function Select({ className, error, ...props }: ComponentProps<"select"> & ControlProps) {
  return <select className={classes(controlClassName, error ? "border-[var(--danger)]" : "border-[var(--border-strong)]", className)} {...props} />;
}

export function Textarea({ className, error, ...props }: ComponentProps<"textarea"> & ControlProps) {
  return <textarea className={classes("min-h-24 resize-y", controlClassName, error ? "border-[var(--danger)]" : "border-[var(--border-strong)]", className)} {...props} />;
}

export function Checkbox({ className, label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return <label className={classes("flex min-h-11 items-center gap-2 text-sm text-[var(--text)]", className)}><input className="size-4 rounded border-[var(--border-strong)] accent-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" type="checkbox" {...props} /><span>{label}</span></label>;
}

export function Button({ className, variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const variants = {
    primary: "border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-90",
    secondary: "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-subtle)]",
    danger: "border-[var(--danger)] bg-[var(--danger)] text-white hover:opacity-90",
  };
  return <button className={classes("inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border px-4 py-2 text-sm font-medium transition disabled:opacity-60", variants[variant], className)} {...props} />;
}

export function FormSection({ children, className, description, title }: { children: ReactNode; className?: string; description?: string; title: string }) {
  return <section className={classes("grid gap-4", className)}><div><h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>{description ? <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p> : null}</div><div className="grid gap-4 md:grid-cols-2">{children}</div></section>;
}

export function FormActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={classes("flex flex-wrap justify-end gap-3 border-t border-[var(--border)] pt-5", className)} {...props} />;
}
