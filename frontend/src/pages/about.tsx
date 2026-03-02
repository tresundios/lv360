import { Link } from "react-router-dom"
import { Content } from "@/components/layout"
import { Button } from "@/components/ui/button"

export function AboutPage() {
  return (
    <Content>
      <h1 className="mb-4 text-2xl font-bold">About</h1>
      <p className="mb-6 text-muted-foreground">
        Basic demo with React, Vite, Tailwind CSS, shadcn/ui, and React Router.
      </p>
      <Button asChild>
        <Link to="/">Back to Home</Link>
      </Button>
    </Content>
  )
}
