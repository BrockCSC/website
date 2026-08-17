import Image from "next/image";

export function Logo() {
  return (
    <div className="flex items-center gap-3 cursor-pointer">
      {/* The tile keeps the club's own red in both themes. */}
      <div className="flex items-center justify-center w-10 h-10 bg-[#9A4440] border-[2px] border-line rounded-[5px] shadow-brut-sm">
        <Image
          src="/logo-light.svg"
          alt="Badger Logo"
          width={36}
          height={34}
          className="object-contain"
        />
      </div>
    </div>
  );
}
