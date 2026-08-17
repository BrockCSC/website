import Link from "next/link";
import Image from "next/image";
import logo from "../../public/logo.svg";
import { DISCORD_INVITE } from "@/lib/links";

const socials = [
  { name: "Instagram", href: "https://www.instagram.com/brockcsc/" },
  { name: "Discord", href: DISCORD_INVITE },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/brockcsc" },
];

export default function Footer() {
  return (
    <footer className="flex flex-col items-center justify-around gap-4 bg-slab p-8 text-slab-ink shadow-[0_-4px_0_0_var(--brand)] [&_a:focus-visible]:outline-slab-brand sm:flex-row sm:p-12">
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
            className="px-1 py-2 text-sm text-slab-ink/70 underline-offset-4 hover:text-slab-ink hover:underline"
          >
            {social.name}
          </Link>
        ))}
      </div>
    </footer>
  );
}
