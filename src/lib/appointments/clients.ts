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
 * The client behind an online booking. Nobody makes an account to get their
 * nails done, so the booking form's name and phone are the identity: the
 * same email, or failing that the same phone, is the same person, and her
 * history stays in one place.
 */
export async function findOrCreateClient(
  studioId: string,
  input: { name: string; phone: string; email?: string | null },
) {
  const email = input.email?.trim().toLowerCase() || null;
  const key = phoneKey(input.phone);

  let user = email
    ? await db.user.findUnique({ where: { studioId_email: { studioId, email } }, include: { studentProfile: true } })
    : null;

  if (!user && key.length >= 6) {
    // Staff type phones with spaces, dashes and prefixes; compare digits only.
    const rows = await db.$queryRaw<{ id: string; phone: string }[]>`
      SELECT id, phone FROM "User"
      WHERE "studioId" = ${studioId} AND role = 'STUDENT' AND phone IS NOT NULL
        AND regexp_replace(phone, '\\D', '', 'g') LIKE ${"%" + key}`;
    const match = rows.find((r) => phoneKey(r.phone) === key);
    if (match) {
      user = await db.user.findUnique({ where: { id: match.id }, include: { studentProfile: true } });
    }
  }

  if (user) {
    // Fill in what we did not know, never overwrite what staff typed.
    if ((!user.phone && input.phone) || (!user.email && email)) {
      user = await db.user.update({
        where: { id: user.id },
        data: { phone: user.phone ?? input.phone, email: user.email ?? email },
        include: { studentProfile: true },
      });
    }
    const profile = user.studentProfile ?? (await db.studentProfile.create({ data: { userId: user.id } }));
    return { user, profile };
  }

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
