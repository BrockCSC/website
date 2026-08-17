import { Navbar } from "@/components/ui/navbar";
import { SkipLink } from "@/components/ui/skip-link";
import Footer from "@/components/ui/footer";

/** Shared shell for the 404 and error boundaries, so both look like the site. */
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
          className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-5 px-5 py-20 text-center"
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
          <div className="flex flex-wrap items-center justify-center gap-3">
            {children}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
