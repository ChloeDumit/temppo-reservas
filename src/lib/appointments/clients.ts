import "server-only";
import { db } from "@/lib/db";

/** Digits only, so "+598 99 123 456" and "099123456" can be compared. */
export function phoneKey(phone: string) {
  const digits = phone.replace(/\D/g, "");
  // Uruguayan mobiles are written both ways: 099 123 456 and +598 99 123 456.
  if (digits.startsWith("598")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * The client this email, or failing that this phone, already belongs to.
 * Staff type phones with spaces, dashes and prefixes; digits are compared.
 */
export async function findClient(studioId: string, input: { phone?: string | null; email?: string | null }) {
  const email = input.email?.trim().toLowerCase() || null;
  const key = input.phone ? phoneKey(input.phone) : "";

  // Staff share the studio's email namespace; a client is never one of them.
  let user = email
    ? await db.user.findFirst({ where: { studioId, email, role: "STUDENT" }, include: { studentProfile: true } })
    : null;

  if (!user && key.length >= 6) {
    const rows = await db.$queryRaw<{ id: string; phone: string }[]>`
      SELECT id, phone FROM "User"
      WHERE "studioId" = ${studioId} AND role = 'STUDENT' AND phone IS NOT NULL
        AND regexp_replace(phone, '\\D', '', 'g') LIKE ${"%" + key}`;
    const match = rows.find((r) => phoneKey(r.phone) === key);
    if (match) {
      user = await db.user.findUnique({ where: { id: match.id }, include: { studentProfile: true } });
    }
  }
  return user;
}

/**
 * The client behind an online booking. Nobody makes an account to get their
 * nails done, so the booking form's name and phone are the identity: the
 * same email, or failing that the same phone, is the same person, and her
 * history stays in one place.
 */
export async function findOrCreateClient(
  studioId: string,
  input: { name: string; phone: string; email?: string | null },
  /**
   * Whether the email typed can be written onto an existing client. Only staff
   * are trusted with that: from the public page anyone can type someone
   * else's phone, and adding their own email to her account would let them
   * sign in as her. The public booking still gets its confirmation at the
   * email typed — see notifyBooked's contactEmail.
   */
  opts: { trustEmail?: boolean } = {},
) {
  let email = input.email?.trim().toLowerCase() || null;
  let user = await findClient(studioId, input);

  if (user) {
    // Fill in what we did not know, never overwrite what staff typed.
    const addEmail = opts.trustEmail && !user.email && email;
    if ((!user.phone && input.phone) || addEmail) {
      user = await db.user.update({
        where: { id: user.id },
        data: { phone: user.phone ?? input.phone, ...(addEmail ? { email } : {}) },
        include: { studentProfile: true },
      });
    }
    const profile = user.studentProfile ?? (await db.studentProfile.create({ data: { userId: user.id } }));
    return { user, profile };
  }

  // An address already used by someone on the team stays theirs.
  if (email && (await db.user.findFirst({ where: { studioId, email }, select: { id: true } }))) email = null;

  const created = await db.user.create({
    data: {
      studioId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email,
      role: "STUDENT",
      studentProfile: { create: {} },
    },
    include: { studentProfile: true },
  });
  return { user: created, profile: created.studentProfile! };
}
