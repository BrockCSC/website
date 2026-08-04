import Image from "next/image";

export function Logo() {
  return (
    <div className="flex items-center gap-3 cursor-pointer">
      <div
        className="flex items-center justify-center w-10 h-10 bg-[#9A4440] border-[2px] border-black rounded-[5px]"
        style={{ boxShadow: "3px 3px 0px 0px rgba(0,0,0,1)" }}
      >
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
