import { cn } from "@/lib/utils"

type ContentProps = {
  children: React.ReactNode
  className?: string
  centered?: boolean
}

export function Content({
  children,
  className,
  centered = false,
}: ContentProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-4xl",
        centered && "flex flex-col items-center justify-center py-16",
        className
      )}
    >
      {children}
    </div>
  )
}
