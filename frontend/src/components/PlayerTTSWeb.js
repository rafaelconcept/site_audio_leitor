"use client";
import { useRef, useState, useEffect } from 'react';

function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

// segments: Array<{ text: string, href?: string }>
export default function PlayerTTSWeb({ segments, voiceURI, onNavigate, onProgress, initialIdx = 0 }) {
  const [currentIdx, setCurrentIdx] = useState(initialIdx);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [tooltipIdx, setTooltipIdx] = useState(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => { setIsMobileDevice(isMobile()); }, []);

  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentIdxRef = useRef(initialIdx);
  const utteranceRef = useRef(null);
  const speakStartedAtRef = useRef(0);
  const onendFiredRef = useRef(false);
  const watchdogRef = useRef(null);
  const voiceURIRef = useRef(voiceURI);
  const speakGenRef = useRef(0);
  const segmentsRef = useRef(segments);
  const activeElementRef = useRef(null);
  const tooltipRef = useRef(null);
  const segListRef = useRef(null);
  const preferDomRef = useRef(null); // null = unknown, true = dom (translated), false = original
  const playbackSegmentsRef = useRef([]);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { voiceURIRef.current = voiceURI; }, [voiceURI]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);
  useEffect(() => { preferDomRef.current = null; playbackSegmentsRef.current = []; }, [segments]);

  // Auto-scroll ao mudar parÃ¡grafo durante leitura
  useEffect(() => {
    const el = activeElementRef.current;
    if (!el) return;
    // rAF garante que o paint aconteceu e getBoundingClientRect Ã© preciso
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const centerY = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
      window.scrollTo({ top: Math.max(0, centerY), behavior: 'smooth' });
    });
  }, [currentIdx]);

  // Scroll para o ponto de retomada na montagem
  useEffect(() => {
    if (initialIdx > 0) {
      setTimeout(() => {
        const el = activeElementRef.current;
        if (!el) return;
        requestAnimationFrame(() => {
          const rect = el.getBoundingClientRect();
          const centerY = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
          window.scrollTo({ top: Math.max(0, centerY), behavior: 'smooth' });
        });
      }, 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha tooltip ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest('[data-tooltip-trigger]')) return;
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setTooltipIdx(null);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const stopWatchdog = () => {
    if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null; }
  };

  const normalizeText = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const decidePreferDom = (domText, originalText) => {
    if (preferDomRef.current !== null) return preferDomRef.current;
    const d = normalizeText(domText);
    const o = normalizeText(originalText);
    // If DOM differs from original, assume translation is active and stick to DOM.
    preferDomRef.current = d && o ? d !== o : !!d;
    return preferDomRef.current;
  };

  const advanceSentence = (sIdx) => {
    const segs = segmentsRef.current;
    if (sIdx < segs.length - 1) {
      const next = sIdx + 1;
      currentIdxRef.current = next;
      setCurrentIdx(next);
      onProgress && onProgress(next);
      doSpeak(next);
    } else {
      stopWatchdog();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentIdx(0);
      currentIdxRef.current = 0;
    }
  };

  const buildDomSegments = () => {
    const nodes = segListRef.current?.querySelectorAll('[data-seg-idx]');
    if (!nodes || nodes.length === 0) return [];
    return Array.from(nodes).map(n => (n.textContent || '').trim());
  };

  const preparePlaybackSegments = () => {
    const domSegs = buildDomSegments();
    const domJoined = domSegs.join(' ');
    const originalJoined = segmentsRef.current.map(s => s.text).join(' ');
    const useDom = decidePreferDom(domJoined, originalJoined);
    if (useDom && domSegs.length > 0) {
      playbackSegmentsRef.current = domSegs;
      return !domSegs.some(s => !s);
    }
    playbackSegmentsRef.current = segmentsRef.current.map(s => s.text);
    return true;
  };

  const ensurePlaybackSegments = (onReady) => {
    const ready = preparePlaybackSegments();
    if (ready) { onReady(); return; }
    setTimeout(() => {
      preparePlaybackSegments();
      onReady();
    }, 250);
  };
  const doSpeak = (sIdx) => {
    const gen = ++speakGenRef.current;
    window.speechSynthesis.cancel();

    // DOM Ã© lido DENTRO do timeout para capturar texto jÃ¡ traduzido pelo browser:
    // neste ponto o React jÃ¡ re-renderizou, o scroll jÃ¡ ocorreu e o tradutor
    // jÃ¡ teve tempo de processar o segmento que entrou na viewport.
    setTimeout(() => {
      if (gen !== speakGenRef.current) return;
      if (!isPlayingRef.current || isPausedRef.current) return;

      const segs = playbackSegmentsRef.current && playbackSegmentsRef.current.length > 0
        ? playbackSegmentsRef.current
        : segmentsRef.current.map(s => s.text);
      const sentence = segs[sIdx] || '';
      if (!sentence) { advanceSentence(sIdx); return; }

      const utterance = new window.SpeechSynthesisUtterance(sentence);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      const vURI = voiceURIRef.current;
      if (vURI) {
        const voices = window.speechSynthesis.getVoices();
        const selected = voices.find(v => v.voiceURI === vURI);
        if (selected) utterance.voice = selected;
      }

      onendFiredRef.current = false;
      speakStartedAtRef.current = Date.now();

      utterance.onend = () => {
        onendFiredRef.current = true;
        if (!isPlayingRef.current || isPausedRef.current) return;
        setTimeout(() => advanceSentence(sIdx), 50);
      };

      utterance.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        onendFiredRef.current = true;
        if (!isPlayingRef.current) return;
        setTimeout(() => doSpeak(sIdx), 500);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }, 150);
  };

  const startWatchdog = () => {
    stopWatchdog();
    watchdogRef.current = setInterval(() => {
      if (!isPlayingRef.current || isPausedRef.current) return;
      const synth = window.speechSynthesis;
      const elapsed = Date.now() - speakStartedAtRef.current;
      if (elapsed > 8000 && !onendFiredRef.current && !synth.speaking && !synth.pending) {
        doSpeak(currentIdxRef.current);
      }
    }, 2000);
  };

  const play = (fromIdx = 0) => {
    setFeedback('');
    isPlayingRef.current = true;
    isPausedRef.current = false;
    currentIdxRef.current = fromIdx;
    setCurrentIdx(fromIdx);
    setIsPlaying(true);
    setIsPaused(false);
    startWatchdog();
    ensurePlaybackSegments(() => doSpeak(fromIdx));
  };

  const pause = () => {
    isPausedRef.current = true;
    setIsPaused(true);
    window.speechSynthesis.cancel();
  };

  const resume = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    doSpeak(currentIdxRef.current);
  };

  const stop = () => {
    isPlayingRef.current = false;
    isPausedRef.current = false;
    stopWatchdog();
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentIdx(0);
    currentIdxRef.current = 0;
  };

  const jumpTo = (idx) => {
    setTooltipIdx(null);
    play(idx);
  };

  useEffect(() => {
    return () => { stopWatchdog(); window.speechSynthesis.cancel(); };
  }, []);

  const status = isPlaying ? (isPaused ? 'Paused' : 'Reading') : 'Stopped';
  const total = segments.length;

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl shadow-lg bg-zinc-800 text-white p-4 md:p-8 flex flex-col items-center gap-6 min-h-[400px]">
      {/* Status */}
      <div className="flex items-center gap-2 w-full justify-center">
        <span className={`h-3 w-3 rounded-full ${isPlaying ? (isPaused ? 'bg-yellow-400' : 'bg-blue-500') : 'bg-zinc-400'}`} />
        <span className="font-medium text-sm">
          {status}{isPlaying ? ` ${currentIdx + 1}/${total}` : ''}
        </span>
      </div>

      {/* Controles inline â€” desktop */}
      <div className="hidden md:flex items-center gap-2 w-full justify-center">
        {isPlaying && !isPaused ? (
          <button onClick={pause} className="rounded bg-yellow-400 hover:bg-yellow-500 p-2 text-black text-2xl w-12 h-12 flex items-center justify-center">&#10073;&#10073;</button>
        ) : isPlaying && isPaused ? (
          <button onClick={resume} className="rounded bg-green-500 hover:bg-green-600 p-2 text-white text-2xl w-12 h-12 flex items-center justify-center">&#9654;</button>
        ) : (
          <button onClick={() => play(currentIdx)} className="rounded bg-green-500 hover:bg-green-600 p-2 text-white text-2xl w-12 h-12 flex items-center justify-center">&#9654;</button>
        )}
        <button onClick={stop} disabled={!isPlaying} className="rounded bg-red-600 hover:bg-red-700 p-2 text-white text-2xl w-12 h-12 flex items-center justify-center disabled:opacity-40">&#9632;</button>
      </div>

      {/* Lista de segmentos */}
      <div ref={segListRef} className="text-lg space-y-1 w-full">
        {segments.map((seg, idx) => {
          const isActive = idx === currentIdx && isPlaying;
          const isBookmark = idx === currentIdx && !isPlaying;
          return (
            <div key={idx} className="relative flex items-baseline gap-1">
              {/* Texto principal */}
              <p
                ref={isActive || isBookmark ? activeElementRef : null}
                onClick={() => setTooltipIdx(tooltipIdx === idx ? null : idx)}
                data-tooltip-trigger
                className={[
                  'flex-1 cursor-pointer rounded px-2 py-1 select-none',
                  isActive ? 'bg-blue-100 text-black' : isBookmark ? 'bg-zinc-600 text-white ring-1 ring-blue-400' : 'hover:bg-zinc-700',
                ].join(' ')}
              >
                <span
                  data-seg-idx={idx}
                  // dangerouslySetInnerHTML prevents React from diffing text nodes
                  // that Google Translate may have wrapped in <font> elements,
                  // avoiding the "removeChild" NotFoundError on re-render.
                  // Safe: seg.text comes from textContent (no HTML tags).
                  dangerouslySetInnerHTML={{ __html: seg.text }}
                />
              </p>

              {/* Badge de link â€” navega dentro do prÃ³prio leitor */}
              {seg.href && (
                <button
                  onClick={e => { e.stopPropagation(); onNavigate && onNavigate(seg.href); }}
                  className="shrink-0 text-xs px-2 py-0.5 rounded bg-zinc-600 hover:bg-blue-600 text-zinc-200 hover:text-white transition whitespace-nowrap"
                  title={seg.href}
                >
                  â†— link
                </button>
              )}

              {/* Tooltip "Ler daqui" */}
              {tooltipIdx === idx && (
                <div
                  ref={tooltipRef}
                  className="absolute left-0 top-full z-10 mt-1 flex items-center gap-2 bg-zinc-900 border border-zinc-600 rounded-lg shadow-lg px-3 py-2"
                >
                  <span className="text-sm text-zinc-300">Ler daqui?</span>
                  <button
                    onClick={() => jumpTo(idx)}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md font-medium"
                  >
                    &#9654; Ler daqui
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {feedback && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <span className="text-sm text-red-400">{feedback}</span>
          <button
            onClick={() => { isPlayingRef.current = true; isPausedRef.current = false; setIsPlaying(true); setIsPaused(false); startWatchdog(); doSpeak(currentIdxRef.current); setFeedback(''); }}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Retomar leitura
          </button>
        </div>
      )}

      {/* FAB mobile */}
      {isMobileDevice ? (
        <div className="fixed bottom-6 right-4 flex flex-col items-end gap-2 z-50">
          {!isPlaying && !isPaused ? (
            /* Antes de tocar: sÃ³ botÃ£o play simples */
            <button
              onClick={() => play(currentIdx)}
              className="w-14 h-14 rounded-full bg-green-500 shadow-lg text-white text-2xl flex items-center justify-center"
            >&#9654;</button>
          ) : (
            /* Durante/pausado: seta expansÃ­vel com pause/resume + stop */
            <>
              {fabOpen && (
                <div className="flex flex-col items-end gap-2">
                  {isPlaying && !isPaused ? (
                    <button onClick={pause} className="w-14 h-14 rounded-full bg-yellow-400 shadow-lg text-black text-2xl flex items-center justify-center">&#10073;&#10073;</button>
                  ) : (
                    <button onClick={resume} className="w-14 h-14 rounded-full bg-green-500 shadow-lg text-white text-2xl flex items-center justify-center">&#9654;</button>
                  )}
                  <button onClick={stop} className="w-14 h-14 rounded-full bg-red-600 shadow-lg text-white text-2xl flex items-center justify-center">&#9632;</button>
                </div>
              )}
              <button
                onClick={() => setFabOpen(o => !o)}
                className="w-12 h-12 rounded-full bg-zinc-700 shadow-lg text-white text-xl flex items-center justify-center transition-transform"
                style={{ transform: fabOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                &#8964;
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 z-50">
          {isPlaying && !isPaused ? (
            <button onClick={pause} className="w-14 h-14 rounded-full bg-yellow-400 shadow-lg text-black text-2xl flex items-center justify-center">&#10073;&#10073;</button>
          ) : isPlaying && isPaused ? (
            <button onClick={resume} className="w-14 h-14 rounded-full bg-green-500 shadow-lg text-white text-2xl flex items-center justify-center">&#9654;</button>
          ) : (
            <button onClick={() => play(currentIdx)} className="w-14 h-14 rounded-full bg-green-500 shadow-lg text-white text-2xl flex items-center justify-center">&#9654;</button>
          )}
          {isPlaying && (
            <button onClick={stop} className="w-14 h-14 rounded-full bg-red-600 shadow-lg text-white text-2xl flex items-center justify-center">&#9632;</button>
          )}
        </div>
      )}
    </div>
  );
}




