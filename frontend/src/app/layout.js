import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Audio Leitor Online",
  description: "Leitor de texto e sites com síntese de voz",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-white">
        <nav className="w-full border-b border-zinc-800 bg-zinc-900 px-4 py-3 flex gap-6 items-center">
          <Link href="/" className="font-semibold hover:text-blue-400 transition">
            📝 Leitor de Texto
          </Link>
          <Link href="/leitor" className="font-semibold hover:text-blue-400 transition">
            🌐 Leitor de Sites
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
