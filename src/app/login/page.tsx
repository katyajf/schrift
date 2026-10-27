import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] supports-[height:100dvh]:min-h-dvh">
      <div className="mt-auto flex flex-col gap-10">
        <div>
          <h1 className="font-dutch text-4xl">Schrift</h1>
          <p className="mt-2 text-muted">Your Dutch notebook, one word at a time.</p>
        </div>
        <Suspense fallback={<LoginForm />}>
          <LoginFormWithError searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginFormWithError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  return <LoginForm linkError={error === "link"} />;
}
