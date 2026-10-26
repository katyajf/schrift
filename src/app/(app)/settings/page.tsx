import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { NewCardLimit, ThemeSetting, VoiceSetting } from "./settings-parts";
import { signOut } from "./actions";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="flex flex-1 flex-col gap-8 px-5 pt-[max(2rem,env(safe-area-inset-top))]">
      <h1 className="font-dutch text-3xl">Settings</h1>

      <Section title="Practice">
        <Suspense fallback={<NewCardLimit initial={null} />}>
          <LimitFromDb />
        </Suspense>
      </Section>

      <Section title="Voice" hint="Saved on this device only, since every phone and browser has different voices.">
        <VoiceSetting />
      </Section>

      <Section title="Appearance">
        <ThemeSetting />
      </Section>

      <div className="flex-1" />

      <Suspense>
        <Account />
      </Suspense>
    </main>
  );
}

async function LimitFromDb() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_settings").select("new_cards_per_day").maybeSingle();
  return <NewCardLimit initial={data?.new_cards_per_day ?? 10} />;
}

async function Account() {
  const { supabase } = await requireUser();
  const { data } = await supabase.auth.getClaims();
  return (
    <form action={signOut} className="flex flex-col gap-2 pb-6">
      <p className="text-center text-sm text-muted">Signed in as {String(data?.claims?.email ?? "")}</p>
      <button className="btn-secondary">Sign out</button>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
