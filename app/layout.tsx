import type { Metadata, Viewport } from "next";
import { Fredoka, Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { ProfileProvider } from "@/components/ProfileProvider";
import { GateNotice } from "@/components/GateNotice";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Reading face for Ummm Less Panic, which asks her to read a question and then
// write two or three paragraphs. A serif carries that length better than Inter.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
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
      className={`${fredoka.variable} ${inter.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="bg-base text-ink min-h-full flex flex-col font-body">
        <ProfileProvider>{children}</ProfileProvider>
        <GateNotice />
      </body>
    </html>
  );
}
