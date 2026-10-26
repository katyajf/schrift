import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-end gap-10 px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="font-dutch text-4xl">Schrift</h1>
        <p className="mt-2 text-muted">Your Dutch notebook, one word at a time.</p>
      </div>
      <Suspense fallback={<LoginForm />}>
        <LoginFormWithError searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginFormWithError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  return <LoginForm linkError={error === "link"} />;
}
