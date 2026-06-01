import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { CookieConsent } from "../src/components/CookieConsent";
import { AuthProvider } from "../src/lib/auth";
import "../src/styles/tokens.css";
import "../src/styles/globals.css";

// Подключаем Inter (с кириллицей) через next/font — раньше шрифт был только
// заявлен в CSS, но не загружался, и на телефонах текст рендерился системным.
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ЭкоПлатформа",
  description: "MVP SaaS-платформы для рынка вторсырья",
  applicationName: "ЭкоПлатформа",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
        <AuthProvider>
          {children}
          <CookieConsent />
        </AuthProvider>
      </body>
    </html>
  );
}
