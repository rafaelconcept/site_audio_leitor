"use client";
import { useEffect, useState, useRef } from 'react';
import PlayerTTSWeb from '../../components/PlayerTTSWeb';

const HISTORY_KEY = 'readerHistory';
const MAX_HISTORY = 10;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveToHistory(url, lastIdx, title) {
  const history = loadHistory().filter(h => h.url !== url);
  history.unshift({ url, lastIdx, title: title || url, savedAt: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function updateHistoryIdx(url, lastIdx) {
  const history = loadHistory();
  const entry = history.find(h => h.url === url);
  if (entry) { entry.lastIdx = lastIdx; localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
}

const BLOCK_TAGS = new Set([
  'P','H1','H2','H3','H4','H5','H6','LI','TD','TH',
  'BLOCKQUOTE','FIGCAPTION','DT','DD','DIV','SECTION','ARTICLE'
]);

// Percorre os nós de um elemento e separa cada <a href> em segmento próprio
function splitByLinks(el, baseUrl) {
  const result = [];
  let buffer = '';

  const flushBuffer = () => {
    const t = buffer.replace(/\s+/g, ' ').trim();
    if (t.length > 1) result.push({ text: t, href: null });
    buffer = '';
  };

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent;
    } else if (node.nodeName === 'A') {
      const raw = node.getAttribute('href');
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (raw && !raw.startsWith('#') && !/^javascript:/i.test(raw.trim()) && text) {
        flushBuffer();
        let href = null;
        try { href = new URL(raw, baseUrl).href; } catch {}
        result.push({ text, href });
      } else {
        buffer += node.textContent;
      }
    } else {
      node.childNodes.forEach(walk);
    }
  };

  el.childNodes.forEach(walk);
  flushBuffer();
  return result;
}

// Extrai segmentos {text, href?} do HTML preservando links
function extractSegments(html, baseUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  ['script', 'style', 'iframe', 'form', 'nav', 'header', 'footer',
    'aside', 'noscript', '[aria-hidden="true"]'].forEach(sel => {
    try { doc.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
  });

  const main =
    doc.querySelector('article') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('main') ||
    doc.querySelector('.post-content') ||
    doc.querySelector('.entry-content') ||
    doc.querySelector('.content') ||
    doc.body;

  const segments = [];

  const blockEls = main.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption, dt, dd, div, section'
  );

  if (blockEls.length > 0) {
    blockEls.forEach(el => {
      const hasBlockChild = [...el.children].some(child => BLOCK_TAGS.has(child.tagName));
      if (!hasBlockChild) {
        segments.push(...splitByLinks(el, baseUrl));
      }
    });
  }

  if (segments.length === 0) {
    (main.textContent || '').split(/\n+/).forEach(line => {
      const t = line.trim();
      if (t) segments.push({ text: t, href: null });
    });
  }

  return segments.filter(s => s.text.length > 0);
}

export default function LeitorURL() {
  const [url, setUrl] = useState('');
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [initialIdx, setInitialIdx] = useState(0);
  const [playerKey, setPlayerKey] = useState(0);
  const currentUrlRef = useRef('');
  const historyPanelRef = useRef(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Fecha painel ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (historyPanelRef.current && !historyPanelRef.current.contains(e.target)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const saved = localStorage.getItem('selectedVoiceURI');
      const populateVoices = () => {
        const v = window.speechSynthesis.getVoices();
        setVoices(v);
        if (!selectedVoice && v.length > 0) {
          const match = saved && v.find(voice => voice.voiceURI === saved);
          setSelectedVoice(match ? match.voiceURI : v[0].voiceURI);
        }
      };
      populateVoices();
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }
  }, [selectedVoice]);

  const handleVoiceChange = (e) => {
    setSelectedVoice(e.target.value);
    localStorage.setItem('selectedVoiceURI', e.target.value);
  };

  const navigateTo = (href) => {
    setUrl(href);
    fetchURLFrom(href, 0);
  };

  const fetchURL = () => fetchURLFrom(url.trim(), 0);

  const fetchURLFrom = async (clean, startIdx = 0) => {
    if (!clean) return;
    setLoading(true);
    setError('');
    setSegments([]);
    setInitialIdx(startIdx);
    currentUrlRef.current = clean;

    const proxies = [
      `https://corsproxy.io/?${encodeURIComponent(clean)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(clean)}`,
    ];

    let lastErr = '';
    for (const proxyUrl of proxies) {
      try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const segs = extractSegments(html, clean);
        if (!segs.length) throw new Error('Nenhum texto encontrado na página.');
        // Extrai título da página para o histórico
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : clean;
        saveToHistory(clean, startIdx, title);
        setHistory(loadHistory());
        setInitialIdx(startIdx);
        setPlayerKey(k => k + 1);
        setSegments(segs);
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e.message;
      }
    }

    setError(`Não foi possível carregar a página: ${lastErr}`);
    setLoading(false);
  };

  const handleProgress = (idx) => {
    updateHistoryIdx(currentUrlRef.current, idx);
    setHistory(loadHistory());
  };

  return (
    <main className="w-full max-w-5xl mx-auto py-10 px-2 md:px-8 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Leitor de Sites</h1>

        {/* Botão de histórico */}
        <div className="relative" ref={historyPanelRef}>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm transition"
            title="Histórico de leitura"
          >
            🕐 Histórico
            {history.length > 0 && (
              <span className="ml-1 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{history.length}</span>
            )}
          </button>

          {showHistory && (
            <div className="absolute right-0 top-full mt-2 w-96 max-w-[90vw] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
                <span className="font-medium text-sm text-zinc-200">Últimos sites lidos</span>
                {history.length > 0 && (
                  <button
                    onClick={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]); }}
                    className="text-xs text-zinc-500 hover:text-red-400 transition"
                  >
                    Limpar
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="px-4 py-6 text-zinc-500 text-sm text-center">Nenhum site visitado ainda.</p>
              ) : (
                <ul className="divide-y divide-zinc-800 max-h-96 overflow-y-auto">
                  {history.map((entry, i) => (
                    <li key={i}>
                      <button
                        onClick={() => {
                          setShowHistory(false);
                          setUrl(entry.url);
                          fetchURLFrom(entry.url, entry.lastIdx || 0);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition flex flex-col gap-0.5"
                      >
                        <span className="text-sm text-white font-medium truncate">{entry.title || entry.url}</span>
                        <span className="text-xs text-zinc-500 truncate">{entry.url}</span>
                        <span className="text-xs text-blue-400">
                          {entry.lastIdx > 0 ? `▶ Continuar no parágrafo ${entry.lastIdx + 1}` : '▶ Ler do início'}
                          {' · '}{new Date(entry.savedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-full flex flex-col md:flex-row gap-2 mb-4">
        <input
          className="flex-1 border border-zinc-700 bg-zinc-900 text-white rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchURL()}
          placeholder="Cole a URL do site (ex: https://exemplo.com/artigo)..."
          type="url"
        />
        <button
          onClick={fetchURL}
          disabled={loading || !url.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium disabled:opacity-50 transition whitespace-nowrap"
        >
          {loading ? 'Carregando...' : 'Carregar'}
        </button>
      </div>

      {error && <p className="w-full text-red-400 mb-4 text-sm">{error}</p>}

      <div className="mb-6 w-full flex flex-col md:flex-row items-center gap-2 md:gap-4">
        <label className="font-medium text-zinc-200">Idioma/Voz:</label>
        <select
          value={selectedVoice || ''}
          onChange={handleVoiceChange}
          className="border border-zinc-700 bg-zinc-800 text-white rounded p-2 w-full md:w-auto focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
        >
          {voices.map((voice, idx) => (
            <option key={voice.voiceURI + '-' + idx} value={voice.voiceURI}>
              {voice.lang} - {voice.name}
            </option>
          ))}
        </select>
      </div>

      {segments.length > 0 ? (
        <PlayerTTSWeb
          key={playerKey}
          segments={segments}
          voiceURI={selectedVoice}
          onNavigate={navigateTo}
          onProgress={handleProgress}
          initialIdx={initialIdx}
        />
      ) : !loading && (
        <div className="w-full max-w-4xl mx-auto rounded-xl shadow-lg bg-zinc-800 text-zinc-400 p-8 flex items-center justify-center min-h-[200px]">
          Cole uma URL acima e clique em Carregar para começar.
        </div>
      )}
    </main>
  );
}
