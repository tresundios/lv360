import { Link } from "react-router-dom"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-lg font-semibold">
          Demo
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" size="sm" asChild>
            <Link to="/">Home</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/demo">Demo</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/about">About</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
