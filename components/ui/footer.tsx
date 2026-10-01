import Link from "next/link";
import Image from "next/image";
import logo from "../../public/logo.svg";
import { DISCORD_INVITE } from "@/lib/links";
import { Lock } from "lucide-react";

const socials = [
  { name: "Instagram", href: "https://www.instagram.com/brockcsc/" },
  { name: "Discord", href: DISCORD_INVITE },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/brockcsc" },
];

export default function Footer() {
  return (
    <footer className="flex flex-col items-center justify-around gap-4 bg-slab pt-8 pr-[max(2rem,env(safe-area-inset-right))] pb-[calc(2rem+env(safe-area-inset-bottom))] pl-[max(2rem,env(safe-area-inset-left))] text-slab-ink shadow-[0_-4px_0_0_var(--brand)] [&_a:focus-visible]:outline-slab-brand sm:flex-row sm:pt-12 sm:pr-[max(3rem,env(safe-area-inset-right))] sm:pb-[calc(3rem+env(safe-area-inset-bottom))] sm:pl-[max(3rem,env(safe-area-inset-left))]">
      <Link href="/" aria-label="BrockCSC home">
        <Image src={logo} alt="" width={80} height={80} />
      </Link>
      <div className="flex flex-col gap-1 text-center sm:text-left">
        <p className="text-xl font-extrabold text-slab-brand">BROCK CSC</p>
        <p className="text-sm text-slab-ink/70">
          © {new Date().getFullYear()} Brock Computer Science - All Rights
          Reserved
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {socials.map((social) => (
          <Link
            key={social.name}
            href={social.href}
            rel="noopener noreferrer"
            target="_blank"
            className="px-1 py-2 text-sm text-slab-ink/70 underline-offset-4 hover:text-slab-ink hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center pointer-coarse:inline-flex pointer-coarse:items-center max-md:px-2 pointer-coarse:min-h-11"
          >
            {social.name}
          </Link>
        ))}
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 px-1 py-2 text-sm text-slab-ink/70 underline-offset-4 hover:text-slab-ink hover:underline max-md:min-h-11 max-md:px-2 pointer-coarse:min-h-11"
        >
          <Lock className="size-3.5" aria-hidden />
          Exec portal
        </Link>
      </div>
    </footer>
  );
}
