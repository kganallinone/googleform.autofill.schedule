import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
};

export function Logo({ className }: LogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <Image
        src="/ftcc-logo.png"
        alt="FTCC Solutions Inc."
        width={180}
        height={52}
        priority
        className="h-11 w-auto object-contain"
      />
    </div>
  );
}
