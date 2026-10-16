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
  markAppointmentAction,
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
      </dl>

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
              <Button
                type="submit"
                size="sm"
                variant={appt.status === outcome ? "primary" : "secondary"}
                className="w-full"
              >
                {outcome === "COMPLETED" ? t("markDone") : t("markNoShow")}
              </Button>
            </form>
          ))}
        </div>
      )}

      <form action={saveStaffNoteAction} className="space-y-2">
        <input type="hidden" name="id" value={appt.id} />
        <Field label={t("staffNotes")}>
          <Textarea name="staffNotes" defaultValue={appt.staffNotes ?? ""} maxLength={1000} placeholder={t("staffNotesPlaceholder")} />
        </Field>
        <Button type="submit" size="sm" variant="ghost">
          {t("saveNote")}
        </Button>
      </form>

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

function errorKey(code?: string) {
  return code === "SLOT_TAKEN" ? "errOverlap" : "errGeneric";
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
      <div className="flex gap-2">
        <SubmitButton size="sm">{t("moveConfirm")}</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
    </form>
  );
}

function CancelForm({ appt, onBack }: { appt: AgendaAppointment; onBack: () => void }) {
  const t = useTranslations("agenda");
  const close = useSheetClose();
  const [state, submit] = useActionState<AgendaState, FormData>(async (prev, fd) => {
    const r = await cancelStaffAppointmentAction(prev, fd);
    if (r?.ok) close();
    return r;
  }, null);
  return (
    <form action={submit} className={cn("space-y-3 border-t border-line pt-3")}>
      <input type="hidden" name="id" value={appt.id} />
      <Field label={t("cancelReason")}>
        <Input name="reason" maxLength={200} placeholder={t("cancelReasonPlaceholder")} />
      </Field>
      {appt.depositStatus === "PAID" && <p className="text-sm text-muted">{t("cancelKeepsDeposit")}</p>}
      {state?.error && <p className="text-sm text-critical">{t("errGeneric")}</p>}
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
