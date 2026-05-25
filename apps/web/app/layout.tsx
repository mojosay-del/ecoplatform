import type { Metadata } from "next";
import { CookieConsent } from "../src/components/CookieConsent";
import { AuthProvider } from "../src/lib/auth";
import "../src/styles/globals.css";

export const metadata: Metadata = {
  title: "ЭкоПлатформа MVP",
  description: "MVP SaaS-платформы для рынка вторсырья",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          {children}
          <CookieConsent />
        </AuthProvider>
      </body>
    </html>
  );
}
