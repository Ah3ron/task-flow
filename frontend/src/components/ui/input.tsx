import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn("flex h-10 w-full rounded-lg border border-base-300 bg-base-100 px-3 text-sm outline-none placeholder:text-base-content/35 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50", className)}
      {...props}
    />
  )
}

export { Input }
