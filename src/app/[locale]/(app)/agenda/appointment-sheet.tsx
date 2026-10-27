"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { SheetCloseProvider, useSheetClose } from "@/components/app/sheet-form";
import {
  cancelStaffAppointmentAction,
  chargeAppointmentAction,
  markAppointmentAction,
  markDepositPaidAction,
  moveAppointmentAction,
  saveStaffNoteAction,
  type AgendaState,
} from "./actions";

export type AgendaAppointment = {
  id: string;
  status: string;
  serviceName: string;
  addOns: string[];
  timeLabel: string;
  dateKey: string;
  startTime: string;
  staffId: string;
  staffName: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  allergies: string | null;
  clientNotes: string | null;
  staffNotes: string | null;
  price: string;
  deposit: string | null;
  depositStatus: string;
  /** A deposit is owed and has not been received. */
  depositDue: boolean;
  /** The code of the transfer the client said she made, if she did. */
  transferCode: string | null;
  /** Approved so far (deposit and anything charged after), formatted; null if nothing. */
  paid: string | null;
  /** What is left of the price, formatted and in cents, and as the amount field's default. */
  balance: string;
  balanceCents: number;
  balanceInput: string;
  started: boolean;
  reminderLink: string | null;
  callLink: string | null;
};

export const STATUS_TONE: Record<string, "neutral" | "accent" | "positive" | "caution" | "critical"> = {
  PENDING_PAYMENT: "caution",
  CONFIRMED: "accent",
  COMPLETED: "positive",
  NO_SHOW: "critical",
  CANCELLED: "neutral",
  LATE_CANCELLED: "neutral",
  EXPIRED: "neutral",
};

/** Opens an appointment's details and everything staff can do with it. */
export function AppointmentSheet({
  appt,
  staff,
  className,
  style,
  children,
}: {
  appt: AgendaAppointment;
  staff: { id: string; name: string }[];
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} style={style}>
        {children}
      </button>
      <Sheet open={open} onClose={close} title={appt.clientName}>
        <SheetCloseProvider close={close}>
          <Details appt={appt} staff={staff} />
        </SheetCloseProvider>
      </Sheet>
    </>
  );
}

function Details({ appt, staff }: { appt: AgendaAppointment; staff: { id: string; name: string }[] }) {
  const t = useTranslations("agenda");
  const live = appt.status === "CONFIRMED" || appt.status === "PENDING_PAYMENT";
  // Money is taken for what is on or has happened, not for what was called off.
  const chargeable = appt.status === "CONFIRMED" || appt.status === "COMPLETED";
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{appt.serviceName}</p>
          {appt.addOns.length > 0 && <p className="text-sm text-muted">+ {appt.addOns.join(", ")}</p>}
          <p className="mt-1 text-sm text-ink-soft">
            {appt.timeLabel} · {appt.staffName}
          </p>
        </div>
        <Badge tone={STATUS_TONE[appt.status]}>{t(`status${appt.status}` as "statusCONFIRMED")}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] bg-sunken p-3 text-sm">
        <dt className="text-muted">{t("price")}</dt>
        <dd className="text-right tabular-nums">{appt.price}</dd>
        {appt.deposit && (
          <>
            <dt className="text-muted">{t("deposit")}</dt>
            <dd className="text-right tabular-nums">
              {appt.deposit} · {t(`deposit${appt.depositStatus}` as "depositPAID")}
            </dd>
          </>
        )}
        {appt.paid && (
          <>
            <dt className="text-muted">{t("paidSoFar")}</dt>
            <dd className="text-right tabular-nums">{appt.paid}</dd>
          </>
        )}
        {chargeable && (
          <>
            <dt className="font-medium text-ink">{appt.balanceCents > 0 ? t("toCharge") : t("fullyPaid")}</dt>
            <dd className="text-right font-medium tabular-nums text-ink">{appt.balanceCents > 0 ? appt.balance : "✓"}</dd>
          </>
        )}
      </dl>

      {chargeable && appt.balanceCents > 0 && <ChargeForm appt={appt} />}

      {appt.depositDue && (appt.status === "PENDING_PAYMENT" || appt.status === "EXPIRED") && (
        <DepositPaid appt={appt} />
      )}

      {appt.allergies && (
        <p className="rounded-[var(--radius-md)] bg-critical-soft px-3 py-2 text-sm text-critical">
          {t("allergies")}: {appt.allergies}
        </p>
      )}
      {appt.clientNotes && (
        <p className="text-sm text-ink-soft">
          <span className="text-muted">{t("clientNotes")}:</span> {appt.clientNotes}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {appt.reminderLink && live && (
          <ButtonLink href={appt.reminderLink} size="sm">
            {t("remindWhatsapp")}
          </ButtonLink>
        )}
        {appt.callLink && (
          <ButtonLink href={appt.callLink} size="sm" variant="secondary">
            {t("call")}
          </ButtonLink>
        )}
        <ButtonLink href={`/clients/${appt.clientId}`} size="sm" variant="ghost">
          {t("clientFile")}
        </ButtonLink>
      </div>

      {(live || appt.status === "COMPLETED" || appt.status === "NO_SHOW") && appt.started && (
        <div className="flex gap-2">
          {(["COMPLETED", "NO_SHOW"] as const).map((outcome) => (
            <form key={outcome} action={markAppointmentAction} className="flex-1">
              <input type="hidden" name="id" value={appt.id} />
              <input type="hidden" name="outcome" value={outcome} />
              <SubmitButton size="sm" variant={appt.status === outcome ? "primary" : "secondary"} className="w-full">
                {outcome === "COMPLETED" ? t("markDone") : t("markNoShow")}
              </SubmitButton>
            </form>
          ))}
        </div>
      )}

      <NoteForm appt={appt} />

      {live && mode === "view" && (
        <div className="flex gap-2 border-t border-line pt-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setMode("move")}>
            {t("move")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode("cancel")}>
            {t("cancel")}
          </Button>
        </div>
      )}
      {mode === "move" && <MoveForm appt={appt} staff={staff} onBack={() => setMode("view")} />}
      {mode === "cancel" && <CancelForm appt={appt} onBack={() => setMode("view")} />}
    </div>
  );
}

export function errorKey(code?: string) {
  switch (code) {
    case "SLOT_TAKEN":
      return "errOverlap";
    case "BLOCKED_TIME":
      return "errBlockedTime";
    case "UNAVAILABLE":
      return "errUnavailable";
    case "ALREADY_CANCELLED":
      return "errAlreadyCancelled";
    case "amount":
      return "errAmount";
    default:
      return "errGeneric";
  }
}

function NoteForm({ appt }: { appt: AgendaAppointment }) {
  const t = useTranslations("agenda");
  const [state, submit] = useActionState<AgendaState, FormData>(saveStaffNoteAction, null);
  return (
    <form action={submit} className="space-y-2">
      <input type="hidden" name="id" value={appt.id} />
      <Field label={t("staffNotes")}>
        <Textarea name="staffNotes" defaultValue={appt.staffNotes ?? ""} maxLength={1000} placeholder={t("staffNotesPlaceholder")} />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" variant="ghost">
          {t("saveNote")}
        </SubmitButton>
        {state?.ok && <span className="text-sm text-positive">{t("noteSaved")}</span>}
        {state?.error && <span className="text-sm text-critical">{t("errGeneric")}</span>}
      </div>
    </form>
  );
}

/** The rest of the price, taken at the chair. */
function ChargeForm({ appt }: { appt: AgendaAppointment }) {
  const t = useTranslations("agenda");
  const [state, submit] = useActionState<AgendaState, FormData>(chargeAppointmentAction, null);
  return (
    <form action={submit} className="space-y-2 rounded-[var(--radius-md)] border border-line p-3">
      <input type="hidden" name="id" value={appt.id} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("chargeAmount")}>
          <Input name="amount" inputMode="decimal" required defaultValue={appt.balanceInput} />
        </Field>
        <Field label={t("chargeMethod")}>
          <Select name="method" defaultValue="CASH">
            <option value="CASH">{t("methodCASH")}</option>
            <option value="BANK_TRANSFER">{t("methodBANK_TRANSFER")}</option>
            <option value="MERCADO_PAGO">{t("methodMERCADO_PAGO")}</option>
            <option value="OTHER">{t("methodOTHER")}</option>
          </Select>
        </Field>
      </div>
      {state?.error && <p className="text-sm text-critical">{t(errorKey(state.error))}</p>}
      <SubmitButton size="sm" className="w-full">
        {t("charge")}
      </SubmitButton>
    </form>
  );
}

function MoveForm({ appt, staff, onBack }: { appt: AgendaAppointment; staff: { id: string; name: string }[]; onBack: () => void }) {
  const t = useTranslations("agenda");
  const close = useSheetClose();
  const [state, submit] = useActionState<AgendaState, FormData>(async (prev, fd) => {
    const r = await moveAppointmentAction(prev, fd);
    if (r?.ok) close();
    return r;
  }, null);
  return (
    <form action={submit} className="space-y-3 border-t border-line pt-3">
      <input type="hidden" name="id" value={appt.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("date")}>
          <Input type="date" name="date" required defaultValue={appt.dateKey} />
        </Field>
        <Field label={t("time")}>
          <Input type="time" name="time" required step={300} defaultValue={appt.startTime} />
        </Field>
      </div>
      {staff.length > 1 ? (
        <Field label={t("professional")}>
          <Select name="staffId" defaultValue={appt.staffId}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="staffId" value={appt.staffId} />
      )}
      {state?.error && <p className="text-sm text-critical">{t(errorKey(state.error))}</p>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm">{t("moveConfirm")}</SubmitButton>
        {state?.error === "BLOCKED_TIME" && (
          <SubmitButton size="sm" variant="secondary" name="force" value="1">
            {t("moveAnyway")}
          </SubmitButton>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
    </form>
  );
}

function CancelForm({ appt, onBack }: { appt: AgendaAppointment; onBack: () => void }) {
  const t = useTranslations("agenda");
  const [whoCancels, setWhoCancels] = useState<"client" | "studio">("client");
  const close = useSheetClose();
  const [state, submit] = useActionState<AgendaState, FormData>(async (prev, fd) => {
    const r = await cancelStaffAppointmentAction(prev, fd);
    if (r?.ok) close();
    return r;
  }, null);
  return (
    <form action={submit} className={cn("space-y-3 border-t border-line pt-3")}>
      <input type="hidden" name="id" value={appt.id} />
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium text-ink-soft">{t("whoCancels")}</legend>
        {(["client", "studio"] as const).map((who) => (
          <label key={who} className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="radio"
              name="who"
              value={who}
              checked={whoCancels === who}
              onChange={() => setWhoCancels(who)}
              className="mt-0.5 size-4 accent-[var(--color-accent)]"
            />
            <span>{who === "client" ? t("cancelByClient") : t("cancelByStudio")}</span>
          </label>
        ))}
      </fieldset>
      <Field label={t("cancelReason")}>
        <Input name="reason" maxLength={200} placeholder={t("cancelReasonPlaceholder")} />
      </Field>
      {appt.depositStatus === "PAID" && (
        <p className="text-sm text-muted">{whoCancels === "client" ? t("cancelClientDeposit") : t("cancelKeepsDeposit")}</p>
      )}
      {state?.error && <p className="text-sm text-critical">{t(errorKey(state.error))}</p>}
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="danger">
          {t("cancelConfirm")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
    </form>
  );
}

/** Staff saw the money arrive: confirm the appointment in one tap. */
export function DepositPaid({ appt, compact }: { appt: Pick<AgendaAppointment, "id" | "deposit" | "transferCode">; compact?: boolean }) {
  const t = useTranslations("agenda");
  return (
    <div className={cn(!compact && "space-y-2 rounded-[var(--radius-md)] bg-caution-soft p-3")}>
      {!compact && (
        <p className="text-sm text-caution">
          {appt.transferCode
            ? t("depositAnnounced", { amount: appt.deposit ?? "", code: appt.transferCode })
            : t("depositMissing", { amount: appt.deposit ?? "" })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <span className="text-sm font-medium text-ink">{t("markPaid")}</span>}
        {(["BANK_TRANSFER", "CASH"] as const).map((method) => (
          <form key={method} action={markDepositPaidAction}>
            <input type="hidden" name="id" value={appt.id} />
            <input type="hidden" name="method" value={method} />
            <Button type="submit" size="sm" variant={method === "BANK_TRANSFER" ? "primary" : "secondary"}>
              {method === "BANK_TRANSFER" ? t("paidTransfer") : t("paidCash")}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
