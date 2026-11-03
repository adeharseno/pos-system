"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, useTransition } from "react";

export type SearchFormProps = ComponentProps<"form"> & {
  action: string;
};

/**
 * SearchForm prevents a full page reload when submitting GET filter/search forms.
 * Instead, it uses Next.js router.push with client-side navigation.
 * Empty text fields are excluded from URL search params to keep URLs clean.
 */
export function SearchForm({ action, onSubmit, children, ...props }: SearchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      {...props}
      action={action}
      onSubmit={(event) => {
        if (onSubmit) {
          onSubmit(event);
          if (event.defaultPrevented) return;
        }

        event.preventDefault();

        const form = event.currentTarget;
        const formData = new FormData(form);
        const params = new URLSearchParams();

        for (const [key, value] of formData.entries()) {
          if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed !== "") {
              params.append(key, trimmed);
            }
          }
        }

        params.delete("page");

        const queryString = params.toString();
        const targetUrl = queryString ? `${action}?${queryString}` : action;

        startTransition(() => {
          router.push(targetUrl);
        });
      }}
      data-pending={isPending ? "true" : undefined}
    >
      {children}
    </form>
  );
}
