"use client";
import Link from 'next/link';

export default function Home() {
  return (
    <main className="w-full max-w-5xl mx-auto py-10 px-2 md:px-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-2">Audio Leitor Online</h1>
      <p className="text-zinc-400 mb-8 text-center max-w-2xl">
        Escolha como quer ler: colar texto diretamente ou carregar um site para leitura.
      </p>

      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/texto"
          className="rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition p-6 flex flex-col gap-2"
        >
          <span className="text-lg font-semibold text-white">Ler Texto</span>
          <span className="text-sm text-zinc-300">
            Cole ou digite o texto e ouça a leitura com destaque de palavras.
          </span>
        </Link>

        <Link
          href="/leitor"
          className="rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition p-6 flex flex-col gap-2"
        >
          <span className="text-lg font-semibold text-white">Ler Site</span>
          <span className="text-sm text-zinc-300">
            Informe a URL para extrair o conteúdo e ouvir a leitura contínua.
          </span>
        </Link>
      </div>
    </main>
  );
}
