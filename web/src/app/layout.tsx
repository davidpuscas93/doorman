import type { Metadata } from "next";
import "./globals.css";

import { AuthProvider } from "@/common/auth/auth-context";
import { SiteHeader } from "@/common/components/site-header";

export const metadata: Metadata = {
  title: "Doorman",
  description: "Event ticketing",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SiteHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
