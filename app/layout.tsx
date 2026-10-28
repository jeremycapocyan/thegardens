import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Gardens | Accounting & Attendance",
  description: "Accounting, partner capital and employee attendance for The Gardens Pickleball Courts.",
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
