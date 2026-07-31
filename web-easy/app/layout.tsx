import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const baseUrl = new URL(`${protocol}://${host}`);

  return {
    metadataBase: baseUrl,
    title: "DingDing Zones",
    description:
      "A focus timer that adapts to your efficiency, effort, and flow.",
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
    },
    openGraph: {
      title: "DingDing Zones",
      description: "Work like workouts. Focus with feedback, not pressure.",
      images: [new URL("/og.png", baseUrl).toString()],
    },
    twitter: {
      card: "summary_large_image",
      title: "DingDing Zones",
      description: "Work like workouts. Focus with feedback, not pressure.",
      images: [new URL("/og.png", baseUrl).toString()],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
