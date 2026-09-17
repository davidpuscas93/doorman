import type { Metadata } from "next";
import "./globals.css";

import { AuthProvider } from "@/common/auth/auth-context";

export const metadata: Metadata = {
  title: "Doorman",
  description: "Event ticketing",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
