// Full-screen flows with their own bottom action bar (review now, practice sessions later).
export default function FocusLayout({ children }: LayoutProps<"/">) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">{children}</div>;
}
