"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { addBookingAction, type ActionState } from "../actions";

export function AddStudentForm({
  classInstanceId,
  students,
}: {
  classInstanceId: string;
  students: { id: string; name: string }[];
}) {
  const t = useTranslations("schedule");
  const tb = useTranslations("booking");
  const tc = useTranslations("common");
  const [state, submit] = useActionState<ActionState, FormData>(addBookingAction, null);

  const errorKeys: Record<string, string> = {
    CLASS_FULL: "classFull",
    ALREADY_BOOKED: "alreadyBooked",
    NO_CREDITS: "noCredits",
    IN_PAST: "inPast",
    BLOCKED: "blocked",
  };

  if (students.length === 0) return null;

  return (
    <form action={submit} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="classInstanceId" value={classInstanceId} />
      <div className="min-w-0 flex-1">
        <Select name="studentId" required defaultValue="" aria-label={t("addStudent")}>
          <option value="" disabled>
            {t("addStudent")}
          </option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </Select>
        {state?.error && (
          <p className="mt-1.5 text-xs text-critical">
            {errorKeys[state.error] ? tb(errorKeys[state.error]) : state.error}
          </p>
        )}
      </div>
      <label className="flex items-center gap-1.5 py-2 text-xs text-muted">
        <input type="checkbox" name="gift" className="size-4 accent-[var(--accent)]" />
        {t("gift")}
      </label>
      <SubmitButton variant="secondary" pendingLabel={tc("saving")}>
        {tc("create")}
      </SubmitButton>
    </form>
  );
}
