"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { errorKey } from "./appointment-sheet";
import { useSheetClose } from "@/components/app/sheet-form";
import { createStaffAppointmentAction, type AgendaState } from "./actions";

type Service = { id: string; name: string; durationMin: number; staffIds: string[]; addOns: { id: string; name: string }[] };

/**
 * Booking someone in by hand: pick her from the people the studio already
 * knows, or type a name and a phone for someone new.
 */
export function NewAppointmentForm({
  clients,
  services,
  staff,
  defaultStaffId,
  defaultDate,
}: {
  clients: { id: string; name: string; phone: string | null }[];
  services: Service[];
  staff: { id: string; name: string }[];
  defaultStaffId: string;
  defaultDate: string;
}) {
  const t = useTranslations("agenda");
  const close = useSheetClose();
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [isNew, setIsNew] = useState(clients.length === 0);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [state, submit] = useActionState<AgendaState, FormData>(async (prev, fd) => {
    const r = await createStaffAppointmentAction(prev, fd);
    if (r?.ok) close();
    return r;
  }, null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    if (!q) return clients.slice(0, 6);
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.phone?.replace(/\D/g, "").includes(digits)))
      .slice(0, 8);
  }, [clients, query]);

  const service = services.find((s) => s.id === serviceId);
  const eligible = service?.staffIds.length ? staff.filter((s) => service.staffIds.includes(s.id)) : staff;
  const chosen = clients.find((c) => c.id === clientId);

  return (
    <form action={submit} className="space-y-4">
      {isNew ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("clientName")}>
              <Input name="clientName" required minLength={2} maxLength={80} />
            </Field>
            <Field label={t("clientPhone")}>
              <Input name="clientPhone" required type="tel" inputMode="tel" placeholder="099 123 456" />
            </Field>
          </div>
          {clients.length > 0 && (
            <button type="button" className="text-sm font-medium text-accent" onClick={() => setIsNew(false)}>
              {t("pickExisting")}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input type="hidden" name="clientId" value={clientId} />
          {chosen ? (
            <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-sunken px-3 py-2.5 text-sm">
              <span className="font-medium text-ink">
                {chosen.name}
                {chosen.phone && <span className="font-normal text-muted"> · {chosen.phone}</span>}
              </span>
              <button type="button" className="text-accent" onClick={() => setClientId("")}>
                {t("change")}
              </button>
            </div>
          ) : (
            <>
              <Field label={t("client")}>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchClient")} autoComplete="off" />
              </Field>
              <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setClientId(c.id)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-sunken">
                      <span className="text-ink">{c.name}</span>
                      <span className="text-muted">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" className="text-sm font-medium text-accent" onClick={() => setIsNew(true)}>
            + {t("newClient")}
          </button>
        </div>
      )}

      <Field label={t("service")}>
        <Select name="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.durationMin} min
            </option>
          ))}
        </Select>
      </Field>

      {service && service.addOns.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {service.addOns.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="addOnIds" value={a.id} className="size-4 accent-[var(--color-accent)]" />
              {a.name}
            </label>
          ))}
        </div>
      )}

      {eligible.length > 1 ? (
        <Field label={t("professional")}>
          <Select name="staffId" defaultValue={eligible.some((s) => s.id === defaultStaffId) ? defaultStaffId : eligible[0]?.id}>
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="staffId" value={eligible[0]?.id ?? defaultStaffId} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("date")}>
          <Input type="date" name="date" required defaultValue={defaultDate} />
        </Field>
        <Field label={t("time")}>
          <Input type="time" name="time" required step={300} defaultValue="10:00" />
        </Field>
      </div>

      <Field label={t("clientNotes")}>
        <Textarea name="notes" maxLength={300} />
      </Field>

      {state?.error && (
        <p className="text-sm text-critical">{state.error === "client" ? t("errClient") : t(errorKey(state.error))}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{t("book")}</SubmitButton>
        {state?.error === "BLOCKED_TIME" && (
          <SubmitButton variant="secondary" name="force" value="1">
            {t("bookAnyway")}
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
