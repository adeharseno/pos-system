import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pharmacy POS Pilot 1",
  description: "Aplikasi kasir apotek",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
