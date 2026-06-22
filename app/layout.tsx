import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Suspense } from "react"
import { cn } from "@/lib/utils"
import { QueryProvider } from "@/components/query-provider"
import { UrlBar } from "@/components/demo/url-bar"
import { SoftNavWatcher } from "@/lib/filters/soft-nav"
import { NuqsAdapter } from "nuqs/adapters/next/app"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider>
          <QueryProvider>
            <NuqsAdapter>
              <Suspense fallback={null}>
                <SoftNavWatcher />
                <UrlBar />
              </Suspense>
              <main className="flex flex-col gap-6 p-6">{children}</main>
            </NuqsAdapter>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
