import { Navbar } from "@/components/ui/navbar";
import { SkipLink } from "@/components/ui/skip-link";
import Footer from "@/components/ui/footer";
import { ToastHost } from "@/components/ui/toast";
import { PageViewTracker } from "@/components/page-view-tracker";

import { PublicCanvas } from "./components/public-canvas";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* overflow-x-clip on the full-width wrapper, not the container: full
          bleed children use negative margins (spec D10). Clip, unlike hidden,
          makes no scroll container, so the sticky navbar keeps working. */}
      <div className="flex-1 overflow-x-clip bg-surface text-ink">
        <SkipLink />
        <Navbar />
        <div
          className="mx-auto w-full max-w-[1060px] pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </div>
      </div>
      <Footer />
      <PageViewTracker />
      <PublicCanvas />
      <ToastHost />
    </>
  );
}
