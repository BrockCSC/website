import Link from "next/link";
import Image from "next/image";
import logo from "../../public/logo.svg";

export default function Footer() {
  return (
    <div
      className="flex items-center justify-around gap-4 bg-foreground p-12  
          shadow-[0px_-4px_0px_var(--color-primary)]"
    >
      <Link href="/">
        <Image src={logo} alt="Brock CSC Logo" width={80} height={80} />
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-primary text-xl font-extrabold">BROCK CSC</h1>
        <p className="text-gray-500 text-sm">
          © {new Date().getFullYear()} Brock Computer Science - All Rights
          Reserved
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="https://www.instagram.com/brockcsc/"
          rel="noopener noreferrer"
          target="_blank"
        >
          <p className="text-gray-500 text-sm">Instagram</p>
        </Link>
        <Link
          href="https://discord.com/invite/qsctEK2"
          rel="noopener noreferrer"
          target="_blank"
        >
          <p className="text-gray-500 text-sm">Discord</p>
        </Link>
        <Link
          href="https://www.linkedin.com/company/brockcsc"
          rel="noopener noreferrer"
          target="_blank"
        >
          <p className="text-gray-500 text-sm">LinkedIn</p>
        </Link>
      </div>
    </div>
  );
}
