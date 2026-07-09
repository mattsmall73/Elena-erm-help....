import type { Metadata, Viewport } from "next";
import { Fredoka, Inter } from "next/font/google";
import "./globals.css";
import { ProfileProvider } from "@/components/ProfileProvider";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forgetful Doodle 2.0",
  description: "Fast, competitive active recall — for Elena. Say it out loud, then flip.",
};

export const viewport: Viewport = {
  themeColor: "#131024",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="bg-base text-ink min-h-full flex flex-col font-body">
        <ProfileProvider>{children}</ProfileProvider>
      </body>
    </html>
  );
}
