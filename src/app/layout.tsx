import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Apotek Cipayung Farma",
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
