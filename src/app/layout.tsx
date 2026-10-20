import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Post-it Todo List",
  description: "Post-it Todo List web application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
