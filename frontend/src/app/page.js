

"use client";
import { useEffect, useState } from 'react';
import PlayerTTS from '../components/PlayerTTS';

export default function Home() {
  const [text, setText] = useState(``);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);

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

  return (
    <main className="w-full max-w-5xl mx-auto py-10 px-2 md:px-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6">Audio Leitor Online</h1>
      <textarea
        className="w-full border border-zinc-700 bg-zinc-900 text-white rounded p-3 mb-4 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Cole ou digite o texto para leitura..."
      />
      <div className="mb-6 w-full flex flex-col md:flex-row items-center gap-2 md:gap-4">
        <label className="font-medium text-zinc-200">Idioma/Voz:</label>
        <select value={selectedVoice || ''} onChange={handleVoiceChange} className="border border-zinc-700 bg-zinc-800 text-white rounded p-2 w-full md:w-auto focus:outline-none focus:ring-2 focus:ring-blue-400 transition">
          {voices.map((voice, idx) => (
            <option key={voice.voiceURI + '-' + idx} value={voice.voiceURI}>
              {voice.lang} - {voice.name}
            </option>
          ))}
        </select>
      </div>
      <PlayerTTS text={text} voiceURI={selectedVoice} />
    </main>
  );
}
