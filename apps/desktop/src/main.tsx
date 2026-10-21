import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { connect } from "@/lib/store"
import { useThemes } from "@/lib/themes"

const root = createRoot(document.getElementById("root")!)

if (window.cad) {
  connect()
  void useThemes.getState().load()
  root.render(
    <StrictMode>
      <ThemeProvider defaultTheme="dark">
        <App />
      </ThemeProvider>
    </StrictMode>
  )
} else {
  root.render(
    <p className="p-6 text-sm text-muted-foreground">
      This is the window of the Enclose desktop app. Start it with{" "}
      <code>npm run dev</code>.
    </p>
  )
}
