import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Apotek Cipayung Farma",
  description: "Aplikasi kasir apotek",
  icons: {
    icon: [
      { url: "/images/logo.png" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/images/logo.png" },
    ],
    shortcut: ["/images/logo.png"],
  },
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
