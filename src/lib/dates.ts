// Lesson dates are plain calendar dates ("2026-11-07"); format them at noon so
// no timezone shift can move them to the previous day.
export function formatLessonDate(date: string, style: "short" | "long" = "long") {
  return new Date(`${date}T12:00:00`).toLocaleDateString(
    "en-GB",
    style === "long" ? { weekday: "short", day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" },
  );
}
