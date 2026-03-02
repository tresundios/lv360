import { BrowserRouter, Routes, Route } from "react-router-dom"
import { MainLayout } from "./components/layout"
import { HomePage } from "./pages/home"
import { AboutPage } from "./pages/about"
import { DemoPage } from "./pages/demo"
import { HelloDbPage } from "./pages/hello-db"
import { HelloCachePage } from "./pages/hello-cache"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/hello-db" element={<HelloDbPage />} />
          <Route path="/hello-cache" element={<HelloCachePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
