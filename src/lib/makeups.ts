import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { startOfMonthInZone, addMonths } from "@/lib/dates";

/**
 * Make-ups: the swap allowance for students on a fixed spot.
 *
 * A fixed-spot student pays for the slot, not for individual classes, so
 * cancelling one returns no credit. Instead they may swap a limited number per
 * calendar month — cancel inside the allowance and they earn a make-up good
 * for any class with a free seat until the month ends. Beyond the allowance,
 * or cancelling late, the class is simply lost.
 *
 * The month is the studio's own, not UTC: a studio in Montevideo should not
 * see its allowance roll over at 9pm on the last day of the month.
 */

export type MakeupBalance = {
  /** Swaps already spent this month, against the studio's allowance. */
  changesUsed: number;
  allowance: number;
  /** Swaps still available before cancellations start costing the class. */
  changesLeft: number;
  /** Make-ups earned and not yet spent — bookable right now. */
  available: number;
  /** When the unspent ones lapse. */
  expiresAt: Date;
};

type Client = Prisma.TransactionClient | typeof db;

export async function makeupBalance(
  studentId: string,
  studio: { id: string; timezone: string; monthlyChangesAllowed: number },
  now = new Date(),
  client: Client = db,
): Promise<MakeupBalance> {
  const monthStart = startOfMonthInZone(now, studio.timezone);
  const monthEnd = addMonths(monthStart, 1);

  const [earned, spent] = await Promise.all([
    // Earned by cancelling a fixed-spot class inside the allowance.
    client.booking.count({
      where: {
        studentId,
        earnedMakeup: true,
        cancelledAt: { gte: monthStart, lt: monthEnd },
      },
    }),
    /*
      Spent on a replacement class. Cancelled replacements are excluded, which
      hands the make-up back — the student swapped, changed their mind, and is
      no worse off than before they booked.
    */
    client.booking.count({
      where: {
        studentId,
        usedMakeup: true,
        status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    }),
  ]);

  return {
    changesUsed: earned,
    allowance: studio.monthlyChangesAllowed,
    changesLeft: Math.max(0, studio.monthlyChangesAllowed - earned),
    available: Math.max(0, earned - spent),
    expiresAt: monthEnd,
  };
}

/**
 * Whether cancelling this booking should grant a make-up.
 *
 * Only fixed-spot classes qualify: a pack booking already gets its credit
 * back, and giving both would pay the student twice. Late cancellations earn
 * nothing, matching how a late pack cancellation spends the credit — the seat
 * is freed too late for anyone else to take it.
 */
export async function shouldEarnMakeup(
  params: {
    studentId: string;
    source: string;
    studentPackId: string | null;
    late: boolean;
  },
  studio: { id: string; timezone: string; monthlyChangesAllowed: number },
  now = new Date(),
  client: Client = db,
): Promise<boolean> {
  if (params.source !== "RECURRING") return false;
  if (params.studentPackId !== null) return false;
  if (params.late) return false;
  if (studio.monthlyChangesAllowed <= 0) return false;

  const balance = await makeupBalance(params.studentId, studio, now, client);
  return balance.changesLeft > 0;
}
