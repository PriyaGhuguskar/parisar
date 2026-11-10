// Parisar mark and name, linking home. Used by the landing nav and the public pages.

import Image from "next/image";
import Link from "next/link";

export function Wordmark({ label, priority = false }) {
  return (
    <Link
      href="/"
      aria-label={label}
      className="focus-ring -ml-1 flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1"
    >
      <Image
        src="/parisar-mark-96.png"
        alt=""
        aria-hidden="true"
        width={36}
        height={36}
        priority={priority}
        className="size-9 shrink-0 object-contain"
      />
      <span className="hidden whitespace-nowrap text-lg font-semibold text-foreground min-[360px]:inline">
        Parisar
      </span>
    </Link>
  );
}
