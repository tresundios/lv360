import { Link } from "react-router-dom"
import { Content } from "@/components/layout"
import { Button } from "@/components/ui/button"

export function HomePage() {
  return (
    <Content centered>
      <h1 className="mb-2 text-3xl font-bold">Welcome</h1>
      <p className="mb-6 text-muted-foreground">
        React + Vite + Tailwind + shadcn/ui + React Router
      </p>
      <div className="flex gap-4">
        <Button>Get started LamViec360 Padu</Button>
        <Button variant="outline" asChild>
          <Link to="/about">Learn more - Rock on!</Link>
        </Button>
      </div>
    </Content>
  )
}
