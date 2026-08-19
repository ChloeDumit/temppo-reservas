import "server-only";
import { db } from "@/lib/db";

export type Range = { from: Date; to: Date };

/**
 * What each instructor earned in the range.
 *
 * Only classes that actually ran count (cancelled ones don't), and the
 * per-class rate wins over the hourly one when both are set.
 */
export async function instructorPayroll(studioId: string, range: Range) {
  const instances = await db.classInstance.findMany({
    where: {
      studioId,
      status: "SCHEDULED",
      startsAt: { gte: range.from, lt: range.to },
      instructorId: { not: null },
    },
    include: {
      instructor: { include: { user: true } },
      _count: { select: { bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } } } } },
    },
  });

  const rows = new Map<
    string,
    {
      instructorId: string;
      name: string;
      classes: number;
      minutes: number;
      attendees: number;
      payCents: number;
      basis: "per_class" | "per_hour" | "unset";
    }
  >();

  for (const instance of instances) {
    const instructor = instance.instructor;
    if (!instructor) continue;

    const minutes = Math.max(
      0,
      Math.round((instance.endsAt.getTime() - instance.startsAt.getTime()) / 60_000),
    );

    const perClass = instructor.payPerClassCents;
    const perHour = instructor.payPerHourCents;
    const pay = perClass ?? (perHour ? Math.round((perHour * minutes) / 60) : 0);
    const basis = perClass ? "per_class" : perHour ? "per_hour" : "unset";

    const existing = rows.get(instructor.id);
    if (existing) {
      existing.classes += 1;
      existing.minutes += minutes;
      existing.attendees += instance._count.bookings;
      existing.payCents += pay;
    } else {
      rows.set(instructor.id, {
        instructorId: instructor.id,
        name: instructor.user.name,
        classes: 1,
        minutes,
        attendees: instance._count.bookings,
        payCents: pay,
        basis,
      });
    }
  }

  return [...rows.values()].sort((a, b) => b.payCents - a.payCents);
}

export async function financialSummary(studioId: string, range: Range) {
  const grouped = await db.transaction.groupBy({
    by: ["type"],
    where: { studioId, occurredAt: { gte: range.from, lt: range.to } },
    _sum: { amountCents: true },
  });

  const income = grouped.find((row) => row.type === "INCOME")?._sum.amountCents ?? 0;
  const expenses = grouped.find((row) => row.type === "EXPENSE")?._sum.amountCents ?? 0;

  return { income, expenses, net: income - expenses };
}

export async function attendanceSummary(studioId: string, range: Range) {
  const grouped = await db.booking.groupBy({
    by: ["status"],
    where: { studioId, classInstance: { startsAt: { gte: range.from, lt: range.to } } },
    _count: { _all: true },
  });

  const count = (status: string) =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;

  return {
    booked: count("BOOKED"),
    attended: count("ATTENDED"),
    noShow: count("NO_SHOW"),
    cancelled: count("CANCELLED") + count("LATE_CANCELLED"),
  };
}

/** Escapes a value for CSV, guarding against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 accents correctly.
  return "﻿" + lines.join("\r\n");
}
