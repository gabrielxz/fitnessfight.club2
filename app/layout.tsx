import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fitness Fight Club",
  description: "Points. Badges. Flex. Track your Strava activities and compete with friends in weekly divisions.",
  keywords: ["fitness", "strava", "competition", "exercise", "tracking", "leaderboard", "badges"],
  authors: [{ name: "Fitness Fight Club" }],
  creator: "Fitness Fight Club",
  publisher: "Fitness Fight Club",
  openGraph: {
    title: "Fitness Fight Club",
    description: "Points. Badges. Flex. Track your Strava activities and compete with friends in weekly divisions.",
    url: "https://fitnessfight.club",
    siteName: "Fitness Fight Club",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fitness Fight Club",
    description: "Points. Badges. Flex. Track your Strava activities and compete with friends.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
    other: [
      {
        rel: "android-chrome-192x192",
        url: "/android-chrome-192x192.png",
      },
      {
        rel: "android-chrome-512x512",
        url: "/android-chrome-512x512.png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
  themeColor: "#0F0F1E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
