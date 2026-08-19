"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { addExpenseAction, recordPaymentAction, type ActionState } from "./actions";

type Option = { id: string; name: string };

export function RecordPaymentForm({
  students,
  packs,
  currency,
}: {
  students: Option[];
  packs: (Option & { priceCents: number })[];
  currency: string;
}) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const ts = useTranslations("students");
  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await recordPaymentAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  const message = state?.error
    ? state.error === "priceInvalid"
      ? te("priceInvalid")
      : te("generic")
    : undefined;

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("student")}>
          <Select name="studentId" required defaultValue="">
            <option value="" disabled>
              {ts("title")}
            </option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("pack")}>
          <Select name="packId" required defaultValue="">
            <option value="" disabled>
              {t("pack")}
            </option>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`${t("amount")} (${currency})`} error={message}>
          <Input name="amount" required inputMode="decimal" placeholder="3200" />
        </Field>
        <Field label={t("method")}>
          <Select name="method" defaultValue="CASH">
            <option value="CASH">{t("methodCASH")}</option>
            <option value="BANK_TRANSFER">{t("methodBANK_TRANSFER")}</option>
            <option value="MERCADO_PAGO">{t("methodMERCADO_PAGO")}</option>
            <option value="OTHER">{t("methodOTHER")}</option>
          </Select>
        </Field>
      </div>
      <Field label={`${t("proof")} / ref.`}>
        <Input name="reference" maxLength={120} placeholder="Transferencia BROU 8842" />
      </Field>
      <SubmitButton pendingLabel={tc("saving")}>{t("registerPayment")}</SubmitButton>
    </form>
  );
}

export function ExpenseForm({ currency }: { currency: string }) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await addExpenseAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  const message = state?.error
    ? state.error === "priceInvalid"
      ? te("priceInvalid")
      : te("generic")
    : undefined;

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("category")}>
          <Input name="category" required maxLength={60} placeholder="Alquiler" />
        </Field>
        <Field label={`${t("amount")} (${currency})`} error={message}>
          <Input name="amount" required inputMode="decimal" placeholder="25000" />
        </Field>
        <Field label={t("date")}>
          <Input
            name="occurredAt"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
      </div>
      <Field label={tc("description")}>
        <Input name="description" maxLength={200} />
      </Field>
      <SubmitButton pendingLabel={tc("saving")}>{t("addExpense")}</SubmitButton>
    </form>
  );
}

export function RejectForm({ paymentId, action }: { paymentId: string; action: (formData: FormData) => void }) {
  const t = useTranslations("payments");
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Input name="reason" maxLength={300} placeholder={t("rejectReason")} className="max-w-56" />
      <SubmitButton variant="ghost" size="sm">
        {t("reject")}
      </SubmitButton>
    </form>
  );
}
