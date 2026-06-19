import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { CookieConsent } from "../src/components/CookieConsent";
import { AuthProvider } from "../src/lib/auth";
import { AppQueryProvider } from "../src/lib/query";
import "../src/styles/tokens.css";
import "../src/styles/globals.css";

// Шрифт лежит в репозитории, чтобы production build не зависел от Google Fonts.
const inter = localFont({
  src: "../src/fonts/Inter-Variable.ttf",
  display: "swap",
  variable: "--font-inter",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ЭкоПлатформа",
  description: "MVP SaaS-платформы для рынка вторсырья",
  applicationName: "ЭкоПлатформа",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ЭкоПлатформа",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-icon-180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body>
        <a className="skip-link" href="#main-content">
          К содержимому
        </a>
        <AppQueryProvider>
          <AuthProvider>
            {children}
            <CookieConsent />
          </AuthProvider>
        </AppQueryProvider>
      </body>
    </html>
  );
}
