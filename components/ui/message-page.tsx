import { Navbar } from "@/components/ui/navbar";
import { SkipLink } from "@/components/ui/skip-link";
import Footer from "@/components/ui/footer";

export function MessagePage({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col bg-surface text-ink">
        <SkipLink />
        <Navbar />
        <main
          className="animate-rise-in mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-5 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] py-20 text-center"
          id="main-content"
          tabIndex={-1}
        >
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand">
            {eyebrow}
          </p>
          <h1 className="text-3xl font-black leading-tight sm:text-4xl">
            {title}
          </h1>
          <p className="text-subtle">{body}</p>
          <div className="flex w-full flex-col gap-3 *:w-full sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:*:w-auto">
            {children}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
