import "server-only";
import { db } from "@/lib/db";
import { dateKeyInZone, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { AgendaAppointment } from "@/app/[locale]/(app)/agenda/appointment-sheet";
import { reminderText, waLink } from "./whatsapp-text";

/*
  What the agenda and the home panel both need, so a booking opened from
  either looks and behaves the same.
*/

export const agendaInclude = {
  client: { include: { user: true } },
  addOns: true,
  staff: { select: { name: true } },
  // A transfer the client announced, so staff can match the code, and what
  // has been paid so far, so the sheet knows what is left to charge.
  payments: {
    where: {
      OR: [{ status: "PENDING" as const, method: "BANK_TRANSFER" as const }, { status: "APPROVED" as const }] as Array<{
        status: "PENDING" | "APPROVED";
        method?: "BANK_TRANSFER";
      }>,
    },
    select: { shortCode: true, status: true, amountCents: true },
  },
} as const;

type Studio = { name: string; timezone: string; locale: string; currency: string };

type Row = {
  id: string;
  status: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  staffId: string;
  clientId: string;
  clientNotes: string | null;
  staffNotes: string | null;
  priceCents: number;
  depositCents: number;
  depositStatus: string;
  addOns: { name: string }[];
  staff: { name: string };
  client: { allergies: string | null; user: { name: string; phone: string | null } };
  payments?: { shortCode: string | null; status?: string; amountCents?: number }[];
};

export function toAgendaView(a: Row, studio: Studio, locale: string, now: Date): AgendaAppointment {
  const tz = studio.timezone;
  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const client = a.client.user;
  return {
    id: a.id,
    status: a.status,
    serviceName: a.serviceName,
    addOns: a.addOns.map((x) => x.name),
    timeLabel: `${formatTime(a.startsAt, tz, locale)}–${formatTime(a.endsAt, tz, locale)}`,
    dateKey: dateKeyInZone(a.startsAt, tz),
    startTime: formatTime(a.startsAt, tz, "es"),
    staffId: a.staffId,
    staffName: a.staff.name,
    clientId: a.clientId,
    clientName: client.name,
    clientPhone: client.phone,
    allergies: a.client.allergies,
    clientNotes: a.clientNotes,
    staffNotes: a.staffNotes,
    price: money(a.priceCents),
    deposit: a.depositCents ? money(a.depositCents) : null,
    depositStatus: a.depositStatus,
    depositDue: a.depositCents > 0 && a.depositStatus === "PENDING",
    transferCode: a.payments?.find((p) => p.status !== "APPROVED" && p.shortCode)?.shortCode ?? null,
    ...balanceOf(a, money),
    started: a.startsAt <= now,
    // The professional's own WhatsApp, message ready. Free, and how most of
    // them already remind people — just without the typing.
    reminderLink: waLink(client.phone, reminderText(a, studio, client.name)),
    callLink: client.phone ? `tel:${client.phone.replace(/[^\d+]/g, "")}` : null,
  };
}

/** What is left to charge: the price, less every payment approved for it. */
function balanceOf(a: Row, money: (cents: number) => string) {
  const paidCents = (a.payments ?? []).filter((p) => p.status === "APPROVED").reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
  const balanceCents = Math.max(0, a.priceCents - paidCents);
  return { paid: paidCents ? money(paidCents) : null, balance: money(balanceCents), balanceCents, balanceInput: (balanceCents / 100).toFixed(0) };
}

/** Everyone who takes appointments: has hours, or has had appointments. */
export async function workingStaff(studioId: string) {
  const staff = await db.user.findMany({
    where: { studioId, isActive: true, role: { in: ["OWNER", "ADMIN", "INSTRUCTOR"] } },
    select: { id: true, name: true, role: true, _count: { select: { workingHours: true, staffAppointments: true } } },
    orderBy: { createdAt: "asc" },
  });
  return staff.filter((s) => s._count.workingHours > 0 || s._count.staffAppointments > 0);
}

/** The pickers behind "Nuevo turno". */
export async function newAppointmentOptions(studioId: string) {
  const [services, globalAddOns, clients] = await Promise.all([
    db.service.findMany({
      where: { studioId, isActive: true },
      include: { staff: true, addOns: { where: { isActive: true } } },
      orderBy: { position: "asc" },
    }),
    db.addOn.findMany({ where: { studioId, isActive: true, serviceId: null } }),
    db.studentProfile.findMany({
      where: { user: { studioId, role: "STUDENT", isActive: true } },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
  ]);
  return {
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMin: s.durationMin,
      staffIds: s.staff.map((x) => x.staffId),
      addOns: [...s.addOns, ...globalAddOns].map((a) => ({ id: a.id, name: a.name })),
    })),
    clients: clients.map((c) => ({ id: c.id, name: c.user.name, phone: c.user.phone })),
  };
}

/**
 * A colour per professional, so a shared week or month reads at a glance.
 * Ordered by the studio's own staff order, which never changes underneath.
 */
const PALETTE = [
  { bg: "#f8e8ed", border: "#b5536f" },
  { bg: "#e6efe9", border: "#4a7c62" },
  { bg: "#e8eef8", border: "#4f6fa8" },
  { bg: "#fbeed6", border: "#9a6b1f" },
  { bg: "#efe8f6", border: "#7a59a6" },
  { bg: "#e4f1f2", border: "#3c8590" },
];

export function staffPalette(staffIds: string[]) {
  return Object.fromEntries(staffIds.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
}
