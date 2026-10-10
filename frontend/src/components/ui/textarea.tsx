import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn("flex min-h-28 w-full resize-y rounded-lg border border-base-300 bg-base-100 px-3 py-2.5 text-sm outline-none placeholder:text-base-content/35 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50", className)}
      {...props}
    />
  )
}

export { Textarea }
