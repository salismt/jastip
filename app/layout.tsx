import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { isProduction, prototypeMode } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jastip Tokyo",
  description: "Titip oleh-oleh dari Tokyo. Bayar dengan QRIS, GoPay, kartu kredit atau transfer bank.",
};
export const viewport: Viewport = { themeColor: "#fbf4ea" };

function snapSrc() {
  if (prototypeMode()) return "/api/prototype/snap.js";
  return isProduction() ? "https://app.midtrans.com/snap/snap.js" : "https://app.sandbox.midtrans.com/snap/snap.js";
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col bg-cream">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-cream/95 px-4 py-3 backdrop-blur">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="size-3 rounded-full bg-brand" />
              Jastip Tokyo
            </Link>
            {!isProduction() && (
              <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-bold tracking-widest text-amber-300">
                SANDBOX
              </span>
            )}
          </header>
          <main className="flex flex-1 flex-col px-4 pt-4 pb-10">{children}</main>
        </div>
        {/* Root layout = stable boundary, so window.snap is ready before the form calls snap.pay(). */}
        <Script
          id="midtrans-snap"
          src={snapSrc()}
          data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? ""}
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
