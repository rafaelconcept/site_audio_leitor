import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import PWARegister from "../components/PWARegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const isProd = process.env.NODE_ENV === "production";
const basePath = isProd ? "/site_audio_leitor" : "";

export const metadata = {
  title: "Audio Leitor Online",
  description: "Leitor de texto e sites com sintese de voz",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Audio Leitor",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-7LPWY8TSZ2"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-7LPWY8TSZ2');
          `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-zinc-950 text-white">
        <PWARegister />
        <nav className="w-full border-b border-zinc-800 bg-zinc-900 px-4 py-3 flex gap-6 items-center">
          <Link href="/" className="font-semibold hover:text-blue-400 transition">
            Inicio
          </Link>
          <Link href="/texto" className="font-semibold hover:text-blue-400 transition">
            Leitor de Texto
          </Link>
          <Link href="/leitor" className="font-semibold hover:text-blue-400 transition">
            Leitor de Sites
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
