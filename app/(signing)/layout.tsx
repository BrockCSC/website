import { Signature } from "lucide-react";
import Image from "next/image";
import { PageViewTracker } from "@/components/page-view-tracker";
import Footer from "@/components/ui/footer";
import { Navbar } from "@/components/ui/navbar";
import { SkipLink } from "@/components/ui/skip-link";
import { ToastHost } from "@/components/ui/toast";
import { PublicCanvas } from "./public-canvas";

/**
 * The e-signing task (/sign, /signed). On desk (>=1024px, fine pointer) it wears the marketing
 * site's chrome, exactly like app/(public)/layout.tsx. On phones (landscape too) the site
 * navigation and footer give way to a slim header with no links, so a stray
 * tap can't walk a signer out of the task.
 */
export default function SigningLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="flex-1 overflow-x-clip bg-surface text-ink">
        <SkipLink />
        <div className="hidden desk:block">
          <Navbar />
        </div>
        <header className="border-b-2 border-line bg-surface pt-[env(safe-area-inset-top)] pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))] desk:hidden">
          <div className="flex h-14 items-center gap-2.5">
            {/* The tile keeps the club's own red in both themes. */}
            <span className="grid size-8 shrink-0 place-items-center rounded-[6px] border-2 border-line bg-[#9A4440]">
              <Image
                alt=""
                className="h-6 w-auto object-contain"
                height={24}
                src="/logo-light.svg"
                width={26}
              />
            </span>
            <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
              BrockCSC Sign
              <Signature aria-hidden className="size-4 text-brand" />
            </p>
          </div>
        </header>
        <div
          className="mx-auto w-full max-w-[1060px] pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </div>
      </div>
      <div className="hidden desk:block">
        <Footer />
      </div>
      <PageViewTracker />
      <PublicCanvas />
      <ToastHost />
    </>
  );
}
