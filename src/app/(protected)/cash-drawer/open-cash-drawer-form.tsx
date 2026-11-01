"use client";

import { useState } from "react";
import { FormError } from "@/modules/ui/components";
import { RupiahInput } from "@/modules/ui/rupiah-input";

type Props = {
  openCashDrawerAction: (formData: FormData) => Promise<never>;
};

export function OpenCashDrawerForm({ openCashDrawerAction }: Props) {
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState("");

  return (
    <form
      action={openCashDrawerAction}
      noValidate
      onSubmit={(event) => {
        if (amount === null) {
          event.preventDefault();
          setError("Saldo Kas Awal harus diisi.");
        }
      }}
      className="grid gap-4"
    >
      <div className="grid gap-2">
        <label
          htmlFor="opening_balance"
          className="text-base font-medium text-gray-700"
        >
          Saldo Kas Awal
        </label>
        <RupiahInput
          id="opening_balance"
          name="opening_balance"
          value={amount}
          error={Boolean(error)}
          aria-describedby={error ? "opening_balance-error" : undefined}
          onValueChange={(value) => {
            setAmount(value);
            if (value !== null) setError("");
          }}
        />
        <FormError id="opening_balance-error">{error}</FormError>
      </div>
      <button
        type="submit"
        className="flex min-h-13 items-center justify-center rounded-xl bg-zinc-950 px-4 text-base font-semibold text-white hover:bg-zinc-800"
      >
        Mulai Sesi Kasir
      </button>
    </form>
  );
}
