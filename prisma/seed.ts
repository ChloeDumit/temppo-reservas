import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TZ = "America/Montevideo";
const PASSWORD = "demo1234";

function wall(dateISO: string, time: string) {
  // Uruguay sits at UTC-3 year-round; fine for seed data.
  return new Date(`${dateISO}T${time}:00-03:00`);
}

function dayKey(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Resetting demo studio…");
  await db.studio.deleteMany({ where: { slug: "estudio-anima" } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const studio = await db.studio.create({
    data: {
      name: "Estudio Ánima",
      slug: "estudio-anima",
      timezone: TZ,
      currency: "UYU",
      locale: "es",
      accentColor: "#E07A5F",
      // Where students send transfer receipts.
      whatsappNumber: "+59899111222",
      plan: "TRIAL",
      trialEndsAt: new Date(Date.now() + 21 * 86_400_000),
      cancellationCutoffHours: 6,
      reminderHoursBefore: 12,
      waitlistClaimWindowMins: 15,
      noShowLimit: 3,
      bookingOpensDaysAhead: 30,
      onboardingCompletedAt: new Date(),
    },
  });

  const location = await db.location.create({
    data: { studioId: studio.id, name: "Sede Pocitos", address: "Av. Brasil 2500, Montevideo" },
  });

  await db.user.create({
    data: {
      studioId: studio.id,
      email: "owner@anima.uy",
      name: "Lucía Ferreira",
      phone: "+59899111222",
      role: "OWNER",
      passwordHash,
      emailVerified: new Date(),
    },
  });

  const instructorUsers = await Promise.all(
    [
      { email: "sofia@anima.uy", name: "Sofía Méndez", color: "#E07A5F", rate: 90000 },
      { email: "martin@anima.uy", name: "Martín Rodríguez", color: "#3F6C8F", rate: 85000 },
    ].map((data) =>
      db.user.create({
        data: {
          studioId: studio.id,
          email: data.email,
          name: data.name,
          role: "INSTRUCTOR",
          passwordHash,
          emailVerified: new Date(),
          instructorProfile: {
            create: { colorHex: data.color, payPerClassCents: data.rate },
          },
        },
        include: { instructorProfile: true },
      }),
    ),
  );

  const [sofia, martin] = instructorUsers.map((u) => u.instructorProfile!);

  const studentSeed = [
    ["ana@example.com", "Ana Pereyra", "1991-04-12"],
    ["belen@example.com", "Belén Cabrera", "1988-11-03"],
    ["carla@example.com", "Carla Suárez", "1995-07-21"],
    ["diego@example.com", "Diego Antúnez", "1983-02-28"],
    ["elena@example.com", "Elena Vidal", "1999-09-15"],
    ["flor@example.com", "Florencia Rey", "1992-12-01"],
    ["gaston@example.com", "Gastón Núñez", "1986-06-08"],
    ["ines@example.com", "Inés Camejo", "2000-01-30"],
    ["julia@example.com", "Julia Bentancor", "1994-03-19"],
    ["lauta@example.com", "Lautaro Silva", "1990-08-05"],
  ] as const;

  const students = [];
  for (const [email, name, birth] of studentSeed) {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email,
        name,
        phone: "+5989" + Math.floor(1000000 + Math.random() * 8999999),
        role: "STUDENT",
        passwordHash,
        emailVerified: new Date(),
        studentProfile: {
          create: {
            birthDate: new Date(`${birth}T00:00:00Z`),
            emergencyContact: "Contacto familiar",
            emergencyPhone: "+59899000000",
            healthNotes: name === "Diego Antúnez" ? "Lesión lumbar — evitar carga axial." : null,
          },
        },
      },
      include: { studentProfile: true },
    });
    students.push(user.studentProfile!);
  }

  const packs = await Promise.all([
    db.classPack.create({
      data: {
        studioId: studio.id,
        name: "4 clases / mes",
        credits: 4,
        priceCents: 180000,
        validityDays: 30,
      },
    }),
    db.classPack.create({
      data: {
        studioId: studio.id,
        name: "8 clases / mes",
        description: "El más elegido.",
        credits: 8,
        priceCents: 320000,
        validityDays: 30,
      },
    }),
    db.classPack.create({
      data: {
        studioId: studio.id,
        name: "Libre mensual",
        isUnlimited: true,
        credits: 0,
        priceCents: 450000,
        validityDays: 30,
      },
    }),
  ]);

  // Class templates
  const templates = await Promise.all([
    db.classTemplate.create({
      data: {
        studioId: studio.id,
        locationId: location.id,
        instructorId: sofia.id,
        name: "Pilates Reformer",
        colorHex: "#E07A5F",
        capacity: 6,
        durationMins: 55,
        weekdays: [1, 3, 5],
        startTime: "08:00",
        startDate: new Date(`${dayKey(-30)}T00:00:00Z`),
      },
    }),
    db.classTemplate.create({
      data: {
        studioId: studio.id,
        locationId: location.id,
        instructorId: martin.id,
        name: "Yoga Vinyasa",
        colorHex: "#3F6C8F",
        capacity: 12,
        durationMins: 60,
        weekdays: [2, 4],
        startTime: "19:00",
        startDate: new Date(`${dayKey(-30)}T00:00:00Z`),
      },
    }),
    db.classTemplate.create({
      data: {
        studioId: studio.id,
        locationId: location.id,
        instructorId: sofia.id,
        name: "Mat & Core",
        colorHex: "#6B7A4B",
        capacity: 10,
        durationMins: 45,
        weekdays: [6],
        startTime: "10:00",
        startDate: new Date(`${dayKey(-30)}T00:00:00Z`),
      },
    }),
  ]);

  // Active packs for most students, plus payments backing them.
  const now = new Date();
  for (const [index, student] of students.entries()) {
    if (index >= 8) continue; // leave two without a pack
    const pack = packs[index % 3];
    const studentPack = await db.studentPack.create({
      data: {
        studioId: studio.id,
        studentId: student.id,
        packId: pack.id,
        creditsTotal: pack.isUnlimited ? 0 : pack.credits,
        creditsUsed: pack.isUnlimited ? 0 : Math.min(pack.credits, index % 3),
        isUnlimited: pack.isUnlimited,
        status: "ACTIVE",
        expiresAt: new Date(now.getTime() + 20 * 86_400_000),
      },
    });

    const payment = await db.payment.create({
      data: {
        studioId: studio.id,
        studentId: student.id,
        studentPackId: studentPack.id,
        amountCents: pack.priceCents,
        currency: "UYU",
        method: index % 2 === 0 ? "BANK_TRANSFER" : "CASH",
        status: "APPROVED",
        approvedAt: new Date(now.getTime() - 5 * 86_400_000),
      },
    });

    await db.transaction.create({
      data: {
        studioId: studio.id,
        type: "INCOME",
        category: "Packs",
        description: pack.name,
        amountCents: pack.priceCents,
        occurredAt: payment.approvedAt!,
        paymentId: payment.id,
      },
    });
  }

  // Two payments awaiting approval, one with a proof image.
  await db.payment.create({
    data: {
      studioId: studio.id,
      studentId: students[8].id,
      amountCents: packs[1].priceCents,
      currency: "UYU",
      method: "BANK_TRANSFER",
      status: "PENDING",
      reference: "Transferencia BROU 8842",
      shortCode: "TP-K4M2Q7",
      proofUrl: "https://placehold.co/600x800/f4efe9/1c1917?text=Comprobante",
    },
  });
  await db.payment.create({
    data: {
      studioId: studio.id,
      studentId: students[9].id,
      amountCents: packs[0].priceCents,
      currency: "UYU",
      method: "BANK_TRANSFER",
      status: "PENDING",
      reference: "Transferencia Itaú 1190",
      shortCode: "TP-B9XD3F",
    },
  });

  // Studio running costs
  await db.transaction.createMany({
    data: [
      {
        studioId: studio.id,
        type: "EXPENSE",
        category: "Alquiler",
        description: "Alquiler del local",
        amountCents: 2500000,
        occurredAt: new Date(now.getTime() - 12 * 86_400_000),
      },
      {
        studioId: studio.id,
        type: "EXPENSE",
        category: "Servicios",
        description: "UTE + OSE",
        amountCents: 480000,
        occurredAt: new Date(now.getTime() - 8 * 86_400_000),
      },
    ],
  });

  // Standing weekly spots — the "I always come Monday and Wednesday at 8" case.
  // Reformer runs Mon/Wed/Fri at 08:00 with capacity 6.
  const reformer = templates[0];
  const yoga = templates[1];

  const standing: [number, { id: string }, string | null][] = [
    [0, reformer, "Viene desde 2024."],
    [1, reformer, null],
    [2, reformer, null],
    [3, reformer, "Lesión lumbar — avisar al profe."],
    [4, yoga, null],
    [5, yoga, null],
  ];

  for (const [index, template, note] of standing) {
    await db.recurringBooking.create({
      data: {
        studioId: studio.id,
        classTemplateId: template.id,
        studentId: students[index].id,
        status: "ACTIVE",
        startDate: new Date(`${dayKey(-30)}T00:00:00Z`),
        note,
      },
    });
  }

  console.log(`Seeded studio ${studio.name} (${studio.slug})`);
  console.log(`  owner@anima.uy / ${PASSWORD}`);
  console.log(`  ana@example.com / ${PASSWORD} (student)`);
  console.log(`  ${templates.length} class templates, ${students.length} students`);
  console.log(`  ${standing.length} standing weekly spots`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
