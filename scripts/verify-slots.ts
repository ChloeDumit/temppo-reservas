/**
 * The slot engine on its own: no database, fixed clock.
 * Run with: npx tsx scripts/verify-slots.ts
 */
import { findSlots, isSlotOpen, pickStaff, type SlotQuery } from "../src/lib/appointments/slots";
import { wallTimeToUtc, formatTime } from "../src/lib/dates";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

const TZ = "America/Montevideo";
// Monday 2026-10-19 is the day under test; "now" is the Friday before.
const MON = "2026-10-19";
const at = (date: string, time: string) => wallTimeToUtc(date, time, TZ);

function base(over: Partial<SlotQuery> = {}): SlotQuery {
  return {
    timeZone: TZ,
    fromDate: MON,
    days: 1,
    now: at("2026-10-16", "12:00"),
    minNoticeMin: 120,
    opensDaysAhead: 30,
    stepMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    staff: [{ id: "ana", durationMin: 60, hours: [{ weekday: 1, startMin: 9 * 60, endMin: 12 * 60 }], busy: [] }],
    ...over,
  };
}

const times = (q: SlotQuery, tz = TZ) =>
  findSlots(q)[0]?.slots.map((s) => formatTime(s.start, tz, "es")) ?? [];

console.log("\nShifts and steps");
check("an hour-long service in a 9–12 shift", times(base()), ["09:00", "09:30", "10:00", "10:30", "11:00"]);
check(
  "a split shift offers both halves and nothing in the gap",
  times(
    base({
      staff: [
        {
          id: "ana",
          durationMin: 60,
          hours: [
            { weekday: 1, startMin: 9 * 60, endMin: 11 * 60 },
            { weekday: 1, startMin: 15 * 60, endMin: 17 * 60 },
          ],
          busy: [],
        },
      ],
    }),
  ),
  ["09:00", "09:30", "10:00", "15:00", "15:30", "16:00"],
);
check(
  "a shift that opens off the grid starts at the next step",
  times(base({ staff: [{ id: "ana", durationMin: 60, hours: [{ weekday: 1, startMin: 9 * 60 + 10, endMin: 12 * 60 }], busy: [] }] })),
  ["09:30", "10:00", "10:30", "11:00"],
);
check("a day she does not work has nothing", findSlots(base({ fromDate: "2026-10-20" }))[0].slots.length, 0);

console.log("\nLength");
check(
  "add-ons that stretch it to 90 minutes push the last start back",
  times(base({ staff: [{ id: "ana", durationMin: 90, hours: [{ weekday: 1, startMin: 540, endMin: 720 }], busy: [] }] })),
  ["09:00", "09:30", "10:00", "10:30"],
);
check(
  "a service longer than the shift never fits",
  times(base({ staff: [{ id: "ana", durationMin: 200, hours: [{ weekday: 1, startMin: 540, endMin: 720 }], busy: [] }] })),
  [],
);

console.log("\nBusy time");
const busyTen = [{ start: at(MON, "10:00"), end: at(MON, "11:00") }];
check(
  "an existing appointment at 10 removes the times that would overlap it",
  times(base({ staff: [{ id: "ana", durationMin: 60, hours: [{ weekday: 1, startMin: 540, endMin: 720 }], busy: busyTen }] })),
  ["09:00", "11:00"],
);
check(
  "back to back is fine: ending exactly when the next one starts",
  times(base({ staff: [{ id: "ana", durationMin: 60, hours: [{ weekday: 1, startMin: 540, endMin: 720 }], busy: busyTen }] }))[0],
  "09:00",
);
check(
  "ten minutes of cleanup after means 9:00 no longer fits before 10",
  times(
    base({
      bufferAfterMin: 10,
      staff: [{ id: "ana", durationMin: 60, hours: [{ weekday: 1, startMin: 540, endMin: 720 }], busy: busyTen }],
    }),
  ),
  ["11:00"],
);
check(
  "prep time before the service also has to be free",
  times(
    base({
      bufferBeforeMin: 15,
      staff: [{ id: "ana", durationMin: 60, hours: [{ weekday: 1, startMin: 540, endMin: 720 }], busy: busyTen }],
    }),
  ),
  ["09:00"],
);
check(
  "a block covering the morning leaves nothing",
  times(
    base({
      staff: [
        {
          id: "ana",
          durationMin: 60,
          hours: [{ weekday: 1, startMin: 540, endMin: 720 }],
          busy: [{ start: at(MON, "00:00"), end: at(MON, "23:59") }],
        },
      ],
    }),
  ),
  [],
);

console.log("\nNotice and the booking window");
check(
  "nothing inside the two hours' notice",
  times(base({ now: at(MON, "08:30") })),
  ["10:30", "11:00"],
);
check("nothing in the past", times(base({ now: at(MON, "13:00") })), []);
check(
  "nothing beyond the booking window",
  findSlots(base({ opensDaysAhead: 2 })).length,
  0,
);

console.log("\nA team");
const team = base({
  staff: [
    { id: "ana", durationMin: 60, hours: [{ weekday: 1, startMin: 540, endMin: 660 }], busy: [] },
    // Bea is slower at the same service.
    { id: "bea", durationMin: 90, hours: [{ weekday: 1, startMin: 600, endMin: 720 }], busy: [] },
  ],
});
const day = findSlots(team)[0].slots;
check(
  "times are the union of everyone's",
  day.map((s) => formatTime(s.start, TZ, "es")),
  ["09:00", "09:30", "10:00", "10:30"],
);
check("10:00 can go to either", day.find((s) => formatTime(s.start, TZ, "es") === "10:00")?.staffIds, ["ana", "bea"]);
check("10:30 only fits Bea", day.find((s) => formatTime(s.start, TZ, "es") === "10:30")?.staffIds, ["bea"]);
check("“cualquiera” picks whoever has less work", pickStaff(["ana", "bea"], { ana: 3, bea: 1 }), "bea");
check("a tie goes to the first listed", pickStaff(["ana", "bea"], {}), "ana");

console.log("\nRe-checking a chosen time");
check("an offered time is open", isSlotOpen(team, "bea", at(MON, "10:30")), true);
check("the wrong professional for it is not", isSlotOpen(team, "ana", at(MON, "10:30")), false);
check("a time off the grid is not", isSlotOpen(team, "ana", at(MON, "09:10")), false);

console.log("\nDaylight saving");
// New York springs forward at 02:00 on Sunday 2026-03-08.
const ny = findSlots({
  ...base(),
  timeZone: "America/New_York",
  fromDate: "2026-03-08",
  now: new Date("2026-03-01T12:00:00Z"),
  staff: [{ id: "ana", durationMin: 60, hours: [{ weekday: 0, startMin: 540, endMin: 660 }], busy: [] }],
})[0].slots.map((s) => formatTime(s.start, "America/New_York", "es"));
check("the shift stays at nine on the wall clock", ny, ["09:00", "09:30", "10:00"]);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
