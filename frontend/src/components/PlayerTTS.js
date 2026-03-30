"use client";
import { useRef, useState, useEffect } from 'react';

function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

export default function PlayerTTS({ text, voiceURI }) {
  const [currentWord, setCurrentWord] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [mobileSentenceIdx, setMobileSentenceIdx] = useState(0);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  useEffect(() => {
    setIsMobileDevice(isMobile());
  }, []);

  // Todas as refs necessárias
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentSentenceIdxRef = useRef(0);
  const utteranceRef = useRef(null);
  const speakStartedAtRef = useRef(0);  // timestamp de quando speak() foi chamado
  const onendFiredRef = useRef(false);  // true se onend foi chamado para a utterance atual
  const watchdogRef = useRef(null);
  const voiceURIRef = useRef(voiceURI);
  const speakGenRef = useRef(0); // previne chains concorrentes de doSpeak
  const activeElementRef = useRef(null);
  const [tooltipIdx, setTooltipIdx] = useState(null); // índice do item com tooltip aberto
  const tooltipRef = useRef(null);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { voiceURIRef.current = voiceURI; }, [voiceURI]);

  // Auto-scroll: rola suavemente para o elemento ativo
  useEffect(() => {
    if (activeElementRef.current) {
      activeElementRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [mobileSentenceIdx, currentWord]);

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

  const jumpTo = (idx) => {
    setTooltipIdx(null);
    if (isMobileDevice) {
      currentSentenceIdxRef.current = idx;
      isPlayingRef.current = true;
      isPausedRef.current = false;
      setMobileSentenceIdx(idx);
      setIsPlaying(true);
      setIsPaused(false);
      startWatchdog();
      doSpeak(idx);
    } else {
      setCurrentWord(idx);
      speakFromIndex(idx);
    }
  };

  function splitMobileChunks(txt) {
    // Divide apenas em quebras naturais: fim de frase ou parágrafo
    // Sem limite de caracteres — mantém o fluxo natural da fala
    const chunks = txt
      .split(/(?<=[.!?。！？])\s+|\n+/)
      .map(s => s.trim())
      .filter(Boolean);
    return chunks.length > 0 ? chunks : [txt.trim()];
  }

  const mobileSentencesRef = useRef([]);
  mobileSentencesRef.current = splitMobileChunks(text);
  const [mobileSentences] = useState(() => splitMobileChunks(text));
  // Recalcula quando texto muda:
  const mobileSentencesLive = splitMobileChunks(text);

  let paragraphs = [];
  let currentParagraph = [];
  for (let line of text.split(/\r?\n/)) {
    if (line.trim() === '') {
      if (currentParagraph.length) paragraphs.push(currentParagraph);
      currentParagraph = [];
    } else {
      currentParagraph.push(line.trim());
    }
  }
  if (currentParagraph.length) paragraphs.push(currentParagraph);
  const allWords = paragraphs.flat();

  const stopWatchdog = () => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  // Avança para a próxima frase (ou finaliza)
  const advanceSentence = (sIdx) => {
    const chunks = mobileSentencesRef.current;
    if (sIdx < chunks.length - 1) {
      const next = sIdx + 1;
      currentSentenceIdxRef.current = next;
      setMobileSentenceIdx(next);
      doSpeak(next);
    } else {
      stopWatchdog();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      setMobileSentenceIdx(0);
      currentSentenceIdxRef.current = 0;
    }
  };

  // Função central de fala — usa apenas refs, zero stale closure
  const doSpeak = (sIdx) => {
    const gen = ++speakGenRef.current; // cada chamada tem geração única
    window.speechSynthesis.cancel();

    const chunks = mobileSentencesRef.current;
    const sentence = chunks[sIdx];
    if (!sentence) { advanceSentence(sIdx); return; }

    // Pequeno delay após cancel() — necessário no iOS para evitar silêncio
    setTimeout(() => {
      if (gen !== speakGenRef.current) return; // chamada obsoleta — ignorar
      if (!isPlayingRef.current || isPausedRef.current) return;

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

  // Watchdog: detecta quando a fala parou sem acionar onend (bug iOS/Android)
  // NÃO faz pause/resume enquanto a fala está ativa — isso interrompe o speech no iOS
  const startWatchdog = () => {
    stopWatchdog();
    watchdogRef.current = setInterval(() => {
      if (!isPlayingRef.current || isPausedRef.current) return;

      const synth = window.speechSynthesis;
      const elapsed = Date.now() - speakStartedAtRef.current;

      // Detecção de travamento: fala parou silenciosamente sem disparar onend
      // Aguarda pelo menos 8s para não confundir com pausas naturais entre chunks
      if (
        elapsed > 8000 &&
        !onendFiredRef.current &&
        !synth.speaking &&
        !synth.pending
      ) {
        doSpeak(currentSentenceIdxRef.current);
      }
    }, 2000);
  };

  const play = () => {
    setFeedback("");
    if (isMobileDevice) {
      isPlayingRef.current = true;
      isPausedRef.current = false;
      currentSentenceIdxRef.current = 0;
      setIsPlaying(true);
      setIsPaused(false);
      setMobileSentenceIdx(0);
      startWatchdog();
      doSpeak(0);
      return;
    }
    if (utteranceRef.current) window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    if (voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const selected = voices.find(v => v.voiceURI === voiceURI);
      if (selected) utterance.voice = selected;
    }
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        let charCount = 0;
        let found = false;
        for (let p = 0; p < paragraphs.length && !found; p++) {
          for (let w = 0; w < paragraphs[p].length && !found; w++) {
            const word = paragraphs[p][w];
            if (!word) continue;
            const idx = text.indexOf(word, charCount);
            if (idx !== -1 && event.charIndex >= idx && event.charIndex < idx + word.length) {
              const globalIdx = paragraphs.slice(0, p).reduce((acc, arr) => acc + arr.length, 0) + w;
              setCurrentWord(globalIdx);
              found = true;
            }
            charCount = idx + word.length;
          }
        }
      }
    };
    utterance.onend = () => { setIsPlaying(false); setIsPaused(false); };
    utterance.onerror = () => { setFeedback("Falha ao iniciar leitura. Tente novamente."); setIsPlaying(false); };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
    setFeedback("");
  };

  const pause = () => {
    isPausedRef.current = true;
    setIsPaused(true);
    if (isMobileDevice) {
      // No mobile, parar mesmo (pause é bugado no iOS)
      window.speechSynthesis.cancel();
    } else {
      window.speechSynthesis.pause();
    }
  };
  const resume = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    if (isMobileDevice) {
      // Reinicia do ponto onde parou
      doSpeak(currentSentenceIdxRef.current);
    } else {
      window.speechSynthesis.resume();
    }
  };
  const stop = () => {
    isPlayingRef.current = false;
    isPausedRef.current = false;
    stopWatchdog();
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentWord(0);
    setMobileSentenceIdx(0);
    currentSentenceIdxRef.current = 0;
  };

  // Barra de status
  const totalWords = allWords.length;
  const status = isPlaying ? (isPaused ? 'Paused' : 'Reading') : 'Stopped';

  // Função para ler a partir de um índice específico (desktop)
  const speakFromIndex = (startIdx) => {
    if (isMobileDevice) {
      isPlayingRef.current = true;
      isPausedRef.current = false;
      currentSentenceIdxRef.current = startIdx;
      startWatchdog();
      setMobileSentenceIdx(startIdx);
      doSpeak(startIdx);
      return;
    }
    if (utteranceRef.current) window.speechSynthesis.cancel();
    const textToRead = allWords.slice(startIdx).join(' ');
    if (!textToRead.trim()) return;
    const utterance = new window.SpeechSynthesisUtterance(textToRead);
    if (voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const selected = voices.find(v => v.voiceURI === voiceURI);
      if (selected) utterance.voice = selected;
    }
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        let wordIdx = 0;
        let charCount = 0;
        let found = false;
        for (let p = 0; p < paragraphs.length && !found; p++) {
          for (let w = 0; w < paragraphs[p].length && !found; w++) {
            const word = paragraphs[p][w];
            if (!word) continue;
            const idx = text.indexOf(word, charCount);
            if (idx !== -1 && event.charIndex >= idx && event.charIndex < idx + word.length) {
              setCurrentWord(startIdx + wordIdx);
              found = true;
            }
            charCount = idx + word.length;
            wordIdx++;
          }
        }
      }
    };
    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setFeedback("Falha ao iniciar leitura. Tente novamente.");
      setIsPlaying(false);
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
    setFeedback("");
  };

  // Handlers para avançar/voltar
  const handlePrev = () => {
    const newIdx = Math.max(currentWord - 1, 0);
    setCurrentWord(newIdx);
    if (isPlaying) speakFromIndex(newIdx);
  };
  const handleNext = () => {
    const newIdx = Math.min(currentWord + 1, totalWords - 1);
    setCurrentWord(newIdx);
    if (isPlaying) speakFromIndex(newIdx);
  };

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      stopWatchdog();
      window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl shadow-lg bg-zinc-800 text-white p-4 md:p-8 flex flex-col items-center gap-6 min-h-[400px]">
      <div className="flex items-center gap-2 w-full justify-center">
        <span className={`h-3 w-3 rounded-full ${isPlaying ? (isPaused ? 'bg-yellow-400' : 'bg-blue-500') : 'bg-zinc-400'}`}></span>
        <span className="font-medium text-sm">
          {status} {isPlaying ? `${currentWord + 1}/${totalWords}` : ''}
        </span>
      </div>
      {/* Controles inline — só visíveis no desktop; no mobile o FAB substitui */}
      <div className="hidden md:flex items-center gap-2 w-full justify-center">
        {isPlaying && !isPaused ? (
          <button onClick={pause} className="rounded bg-yellow-400 hover:bg-yellow-500 p-2 text-black text-2xl w-12 h-12 flex items-center justify-center">&#10073;&#10073;</button>
        ) : isPlaying && isPaused ? (
          <button onClick={resume} className="rounded bg-green-500 hover:bg-green-600 p-2 text-white text-2xl w-12 h-12 flex items-center justify-center">&#9654;</button>
        ) : (
          <button onClick={play} className="rounded bg-green-500 hover:bg-green-600 p-2 text-white text-2xl w-12 h-12 flex items-center justify-center">&#9654;</button>
        )}
        <button onClick={stop} className="rounded bg-red-600 hover:bg-red-700 p-2 text-white text-2xl w-12 h-12 flex items-center justify-center">&#9632;</button>
        <button onClick={handleNext} disabled={currentWord === totalWords - 1} className="rounded bg-zinc-700 hover:bg-zinc-600 p-2 text-lg disabled:opacity-50">&#8594;</button>
      </div>
      <div className="text-lg space-y-2 w-full">
        {isMobileDevice
          ? mobileSentencesLive.map((sentence, idx) => (
              <div key={idx} className="relative">
                <p
                  ref={idx === mobileSentenceIdx && isPlaying ? activeElementRef : null}
                  onClick={() => setTooltipIdx(tooltipIdx === idx ? null : idx)}
                  data-tooltip-trigger
                  className={[
                    'cursor-pointer rounded px-2 py-1 select-none',
                    idx === mobileSentenceIdx && isPlaying ? 'bg-blue-100 text-black' : 'hover:bg-zinc-700'
                  ].join(' ')}
                >{sentence}</p>
                {tooltipIdx === idx && (
                  <div ref={tooltipRef} className="absolute left-0 z-10 mt-1 flex items-center gap-2 bg-zinc-900 border border-zinc-600 rounded-lg shadow-lg px-3 py-2">
                    <span className="text-sm text-zinc-300">Ler daqui?</span>
                    <button
                      onClick={() => jumpTo(idx)}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md font-medium"
                    >&#9654; Ler daqui</button>
                  </div>
                )}
              </div>
            ))
          : paragraphs.map((words, pIdx) => (
              <p key={pIdx} className="flex flex-wrap">
                {words.map((word, wIdx) => {
                  const globalIdx = paragraphs.slice(0, pIdx).reduce((acc, arr) => acc + arr.length, 0) + wIdx;
                  const isActive = globalIdx === currentWord;
                  return (
                    <span
                      key={wIdx}
                      ref={isActive ? activeElementRef : null}
                      onClick={() => setTooltipIdx(tooltipIdx === globalIdx ? null : globalIdx)}
                      data-tooltip-trigger
                      style={isActive ? { backgroundColor: '#a3c9f9', color: '#222', borderRadius: '0.25rem', padding: '0 0.25rem' } : {}}
                      className="cursor-pointer hover:underline relative"
                    >
                      {word}
                      {tooltipIdx === globalIdx && (
                        <span ref={tooltipRef} className="absolute left-0 top-6 z-10 flex items-center gap-2 bg-zinc-900 border border-zinc-600 rounded-lg shadow-lg px-3 py-2 whitespace-nowrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); jumpTo(globalIdx); }}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md font-medium"
                          >&#9654; Ler daqui</button>
                        </span>
                      )}
                      {' '}
                    </span>
                  );
                })}
              </p>
            ))}
      </div>

      {feedback && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <span className="text-sm text-red-400">{feedback}</span>
          {isMobileDevice && (
            <button onClick={() => { isPlayingRef.current = true; isPausedRef.current = false; setIsPlaying(true); setIsPaused(false); startWatchdog(); doSpeak(currentSentenceIdxRef.current); setFeedback(""); }} className="px-4 py-2 bg-blue-600 text-white rounded">Retomar leitura</button>
          )}
        </div>
      )}

      {/* FAB flutuante canto inferior direito */}
      {isMobileDevice ? (
        <div className="fixed bottom-6 right-4 flex flex-col items-end gap-2 z-50">
          {fabOpen && (
            <div className="flex flex-col items-end gap-2">
              {isPlaying && !isPaused ? (
                <button onClick={pause} className="w-14 h-14 rounded-full bg-yellow-400 shadow-lg text-black text-2xl flex items-center justify-center">&#10073;&#10073;</button>
              ) : isPlaying && isPaused ? (
                <button onClick={resume} className="w-14 h-14 rounded-full bg-green-500 shadow-lg text-white text-2xl flex items-center justify-center">&#9654;</button>
              ) : (
                <button onClick={play} className="w-14 h-14 rounded-full bg-green-500 shadow-lg text-white text-2xl flex items-center justify-center">&#9654;</button>
              )}
              {isPlaying && (
                <button onClick={stop} className="w-14 h-14 rounded-full bg-red-600 shadow-lg text-white text-2xl flex items-center justify-center">&#9632;</button>
              )}
            </div>
          )}
          <button
            onClick={() => setFabOpen(o => !o)}
            className="w-12 h-12 rounded-full bg-zinc-700 shadow-lg text-white text-xl flex items-center justify-center transition-transform"
            style={{ transform: fabOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >&#8964;</button>
        </div>
      ) : (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 z-50">
          {isPlaying && !isPaused ? (
            <button onClick={pause} className="w-14 h-14 rounded-full bg-yellow-400 shadow-lg text-black text-2xl flex items-center justify-center">&#10073;&#10073;</button>
          ) : isPlaying && isPaused ? (
            <button onClick={resume} className="w-14 h-14 rounded-full bg-green-500 shadow-lg text-white text-2xl flex items-center justify-center">&#9654;</button>
          ) : (
            <button onClick={play} className="w-14 h-14 rounded-full bg-green-500 shadow-lg text-white text-2xl flex items-center justify-center">&#9654;</button>
          )}
          {isPlaying && (
            <button onClick={stop} className="w-14 h-14 rounded-full bg-red-600 shadow-lg text-white text-2xl flex items-center justify-center">&#9632;</button>
          )}
        </div>
      )}
    </div>
  );
}
