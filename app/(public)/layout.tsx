import { Navbar } from "@/components/ui/navbar";
import { SkipLink } from "@/components/ui/skip-link";
import Footer from "@/components/ui/footer";
import { PageViewTracker } from "@/components/page-view-tracker";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="flex-1 bg-surface text-ink">
        <SkipLink />
        <Navbar />
        <div
          className="mx-auto w-full max-w-[1060px] px-5"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </div>
      </div>
      <Footer />
      <PageViewTracker />
    </>
  );
}
