import { Navbar } from "@/components/ui/navbar";
import Footer from "@/components/ui/footer";
import { PageViewTracker } from "@/components/page-view-tracker";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="flex-1 bg-background text-[#1b1d1f]">
        <Navbar />
        <div className="mx-auto w-full max-w-[1060px] px-5">{children}</div>
      </div>
      <Footer />
      <PageViewTracker />
    </>
  );
}
