import { render, screen, cleanup } from "@testing-library/react"
import { describe, it, expect, afterEach } from "vitest"
import App from "./App"

afterEach(() => {
  cleanup()
})

describe("App", () => {
  it("renders the home page with welcome text", () => {
    render(<App />)
    expect(screen.getByText("Welcome")).toBeInTheDocument()
  })

  it("renders the get started button", () => {
    render(<App />)
    expect(screen.getByText("Get started LamViec360 Padu")).toBeInTheDocument()
  })

  it("renders the learn more link", () => {
    render(<App />)
    expect(screen.getByText("Learn more - Rock on!")).toBeInTheDocument()
  })
})
