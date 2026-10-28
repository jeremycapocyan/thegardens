import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Gardens | Court & Business Tracker",
  description: "Sales, court operations and business records for The Gardens Pickleball Courts.",
  icons: {
    icon: "/gardens-icon.svg",
    shortcut: "/gardens-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
