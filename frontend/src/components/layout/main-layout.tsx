import { Outlet } from "react-router-dom"
import { Footer } from "./footer"
import { Header } from "./header"

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="mx-auto flex flex-1 flex-col px-6 py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
