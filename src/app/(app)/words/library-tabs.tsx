import Link from "next/link";

// Words | Sets switch at the top of the library.
export function LibraryTabs({ active }: { active: "words" | "sets" }) {
  const tab = (key: "words" | "sets", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`flex-1 rounded-lg py-1.5 text-center text-sm transition ${
        active === key ? "bg-card text-ink shadow-[0_0_0_0.5px_var(--line-strong)]" : "text-muted"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Library" className="mb-3 flex gap-1 rounded-xl bg-sunken p-1">
      {tab("words", "/words", "Words")}
      {tab("sets", "/words/sets", "Sets")}
    </nav>
  );
}
