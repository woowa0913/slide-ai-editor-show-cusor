
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Slide, VoiceName, GenerationState, ScriptLevel, ScriptLength, AspectRatio, SubtitleStyle } from './types';
import { SAMPLE_SLIDES, PLACEHOLDER_IMAGE } from './constants';
import { SlideThumbnail } from './components/SlideThumbnail';
import { PreviewArea } from './components/PreviewArea';
import { EditorPanel } from './components/EditorPanel';
import { base64ToBytes, decodeAudioData } from './services/audioUtils';

const loadGeminiService = () => import('./services/geminiService');
const loadPdfUtils = () => import('./services/pdfUtils');
const loadVideoRenderer = () => import('./services/videoRenderer');
const loadPptxService = () => import('./services/pptxService');

const App: React.FC = () => {
  const [slides, setSlides] = useState<Slide[]>(SAMPLE_SLIDES);
  const slidesRef = useRef<Slide[]>(SAMPLE_SLIDES);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  const [activeSlideId, setActiveSlideId] = useState<string>(SAMPLE_SLIDES.length > 0 ? SAMPLE_SLIDES[0].id : '');
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([]);
  const [generationState, setGenerationState] = useState<GenerationState>({ isExporting: false, progress: 0, statusMessage: '' });
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.Video16_9);
  const [includeSubtitles, setIncludeSubtitles] = useState<boolean>(true);
  
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Zephyr);
  const [scriptLevel, setScriptLevel] = useState<ScriptLevel>('new_hire');
  const [scriptLength, setScriptLength] = useState<ScriptLength>('medium');
  
  // New State for Animation Selection
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>({
    fontSize: 32,
    fontFamily: 'Inter',
    color: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.6,
    verticalPosition: 90,
    highlightColor: '#ffff00',
  });

  const [logoError, setLogoError] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const activeSlide = useMemo(() => slides.find(s => s.id === activeSlideId), [slides, activeSlideId]);

  // Reset selected element when slide changes
  useEffect(() => {
    setSelectedElementId(null);
  }, [activeSlideId]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setGenerationState({ isExporting: true, progress: 0, statusMessage: '파일 처리 중...' });
    
    try {
      const newSlides: Slide[] = [];
      let convertPdfToImages: ((file: File) => Promise<string[]>) | null = null;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === 'application/pdf') {
          if (!convertPdfToImages) {
            ({ convertPdfToImages } = await loadPdfUtils());
          }
          const images = await convertPdfToImages(file);
          images.forEach((imgUrl) => {
            newSlides.push({
              id: Math.random().toString(36).substr(2, 9),
              imageUrl: imgUrl,
              script: "",
              subtitle: "",
              audioData: null,
              isGeneratingAudio: false,
              visualElements: []
            });
          });
        } else {
          const reader = new FileReader();
          const p = new Promise<string>((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          const imgUrl = await p;
          newSlides.push({
            id: Math.random().toString(36).substr(2, 9),
            imageUrl: imgUrl,
            script: "",
            subtitle: "",
            audioData: null,
            isGeneratingAudio: false,
            visualElements: []
          });
        }
      }

      setSlides(prev => {
        const updated = [...prev, ...newSlides];
        if (prev.length === 0 && newSlides.length > 0) setActiveSlideId(newSlides[0].id);
        return updated;
      });
    } catch (e) {
      console.error(e);
      alert("파일 로드 중 오류가 발생했습니다.");
    } finally {
      setGenerationState({ isExporting: false, progress: 0, statusMessage: '' });
      if (event.target) event.target.value = '';
    }
  };

  const updateSlide = (id: string, updates: Partial<Slide>) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteSlide = (id: string) => {
    setSlides(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (activeSlideId === id) setActiveSlideId(filtered.length > 0 ? filtered[0].id : '');
      return filtered;
    });
    setSelectedSlideIds(prev => prev.filter(sid => sid !== id));
  };

  const toggleSlideSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedSlideIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedSlideIds.length === slides.length && slides.length > 0) {
      setSelectedSlideIds([]);
    } else {
      setSelectedSlideIds(slides.map(s => s.id));
    }
  };

  // Bulk Script Generation
  const handleBulkGenerateScript = async () => {
    const targetIds = selectedSlideIds.length > 0 ? selectedSlideIds : (activeSlideId ? [activeSlideId] : []);
    if (targetIds.length === 0) return;

    // Show processing state visually in slides
    setSlides(prev => prev.map(s => targetIds.includes(s.id) ? { ...s, script: "AI 분석 중..." } : s));
    const { generateSlideScript } = await loadGeminiService();

    for (const id of targetIds) {
      const targetSlide = slidesRef.current.find(s => s.id === id);
      if (!targetSlide) continue;
      
      try {
        const base64Data = targetSlide.imageUrl.split(',')[1] || targetSlide.imageUrl;
        const result = await generateSlideScript(base64Data, scriptLevel, scriptLength);
        updateSlide(id, { script: result.script, subtitle: result.subtitle });
      } catch (err) {
        updateSlide(id, { script: "오류: 분석에 실패했습니다." });
      }
    }
  };

  // Bulk Audio Generation
  const handleBulkGenerateAudio = async () => {
    const targetIds = selectedSlideIds.length > 0 ? selectedSlideIds : (activeSlideId ? [activeSlideId] : []);
    if (targetIds.length === 0) return;
    const eligibleSlides = targetIds
      .map(id => slidesRef.current.find(s => s.id === id))
      .filter((slide): slide is Slide => Boolean(slide && slide.script && !slide.script.includes("분석 중")));

    if (eligibleSlides.length === 0) {
      alert("음성 생성할 대본이 없습니다. 먼저 대본을 입력하거나 생성해 주세요.");
      return;
    }

    const { generateSpeech } = await loadGeminiService();
    let firstErrorMessage: string | null = null;
    for (const targetSlide of eligibleSlides) {
      const id = targetSlide.id;

      updateSlide(id, { isGeneratingAudio: true });
      try {
        const base64Audio = await generateSpeech(targetSlide.script, selectedVoice);
        if (base64Audio) {
          const buffer = await decodeAudioData(base64ToBytes(base64Audio), getAudioContext());
          updateSlide(id, { audioData: buffer, isGeneratingAudio: false });
        } else {
          throw new Error("No audio");
        }
      } catch (err: unknown) {
        if (!firstErrorMessage) {
          firstErrorMessage = err instanceof Error ? err.message : "Unknown error";
        }
        updateSlide(id, { isGeneratingAudio: false });
      }
    }

    if (firstErrorMessage) {
      const localApiHint = firstErrorMessage.includes("404")
        ? "\n\n로컬에서 실행 중이라면 `vercel dev`로 실행해야 /api/gemini 엔드포인트가 동작합니다."
        : "";
      alert(`음성 생성 중 오류가 발생했습니다.\n${firstErrorMessage}${localApiHint}`);
    }
  };

  const handleExport = async () => {
    if (slides.length === 0) return;
    setGenerationState({ isExporting: true, progress: 0, statusMessage: '비디오 렌더링 초기화 중...' });
    try {
      const { exportVideo } = await loadVideoRenderer();
      const blob = await exportVideo(
        slides, 
        aspectRatio === AspectRatio.Portrait9_16 ? 1080 : 1920,
        aspectRatio === AspectRatio.Portrait9_16 ? 1920 : 1080,
        aspectRatio,
        subtitleStyle, 
        (p, msg) => setGenerationState(prev => ({ ...prev, progress: p, statusMessage: msg })),
        includeSubtitles
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slide-ai-editor-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("비디오 생성 실패");
    } finally {
      setGenerationState({ isExporting: false, progress: 0, statusMessage: '' });
    }
  };

  const handlePptxExport = async () => {
    if (slides.length === 0) return;
    try {
      const { exportPptx } = await loadPptxService();
      await exportPptx(slides, aspectRatio);
    } catch (err) {
      alert("PPTX 변환 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden font-sans relative">
      <header className="h-20 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-6 z-20 shadow-xl">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0 border border-white/10 group">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-white group-hover:scale-105 transition-transform">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <path d="M7 11 L11 9 L13 13 L17 8" strokeWidth="2" />
             </svg>
          </div>
          <div className="h-8 flex items-center justify-center">
            {!logoError ? (
              <img 
                src="https://drive.google.com/uc?export=view&id=1cg9YBFIuZtsnn_oekcN121ks_JnJPiX-" 
                alt="kt cloud" 
                className="h-full object-contain brightness-0 invert opacity-95"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className="text-2xl font-sans tracking-tight text-white/90 font-medium">kt <span className="font-bold">cloud</span></span>
            )}
          </div>
          <h1 className="font-bold text-3xl tracking-tight text-white">Slide AI Editor</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
            <button onClick={() => setAspectRatio(AspectRatio.Video16_9)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${aspectRatio === AspectRatio.Video16_9 ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>16:9</button>
            <button onClick={() => setAspectRatio(AspectRatio.Portrait9_16)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${aspectRatio === AspectRatio.Portrait9_16 ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>9:16</button>
            <button onClick={() => setAspectRatio(AspectRatio.Top)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${aspectRatio === AspectRatio.Top ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Top</button>
            <button onClick={() => setAspectRatio(AspectRatio.Bottom)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${aspectRatio === AspectRatio.Bottom ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Bottom</button>
            <button onClick={() => setAspectRatio(AspectRatio.Original)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${aspectRatio === AspectRatio.Original ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Original</button>
          </div>
          <button onClick={() => setIncludeSubtitles(!includeSubtitles)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold ${includeSubtitles ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
            <div className={`w-3 h-3 rounded-full ${includeSubtitles ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-600'}`}></div>
            <span>Subtitles {includeSubtitles ? 'ON' : 'OFF'}</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={handlePptxExport} disabled={generationState.isExporting || slides.length === 0} className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-full font-bold text-sm shadow-lg transition-all flex items-center gap-2 disabled:opacity-30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-orange-400"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              Export PPTX
            </button>
            <button onClick={handleExport} disabled={generationState.isExporting || slides.length === 0} className="px-6 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 rounded-full font-bold shadow-xl transition-all flex items-center gap-2 disabled:opacity-30 disabled:grayscale text-sm">
              {generationState.isExporting ? 'Exporting...' : 'Export Video'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col z-10 shadow-2xl">
          <div className="p-5 border-b border-gray-800 bg-gray-900/50">
             <div className="flex justify-between items-center">
               <h2 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">Slide Manager</h2>
               <button onClick={handleSelectAll} className="text-[10px] font-bold text-brand-400 hover:text-brand-300 transition-colors">
                 {selectedSlideIds.length === slides.length && slides.length > 0 ? 'DESELECT ALL' : 'SELECT ALL'}
               </button>
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {slides.map((slide, idx) => (
              <SlideThumbnail 
                key={slide.id} 
                slide={slide} 
                index={idx} 
                isActive={slide.id === activeSlideId} 
                isSelected={selectedSlideIds.includes(slide.id)}
                onClick={() => setActiveSlideId(slide.id)} 
                onSelect={(e) => toggleSlideSelection(slide.id, e)}
                onDelete={deleteSlide} 
              />
            ))}
            <label className="border-2 border-dashed border-gray-800 hover:border-brand-500/50 hover:bg-brand-500/5 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all gap-3 group">
              <input type="file" className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileUpload} />
              <div className="w-12 h-12 bg-gray-800 group-hover:bg-brand-600 rounded-full flex items-center justify-center transition-all shadow-lg shadow-black/40"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6 text-gray-400 group-hover:text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></div>
              <span className="text-xs font-black text-gray-500 group-hover:text-brand-400 uppercase tracking-widest text-center">Add Images or PDF</span>
            </label>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-gray-950">
          <PreviewArea 
            activeSlide={activeSlide} 
            aspectRatio={aspectRatio} 
            subtitleStyle={subtitleStyle} 
            onUpdateSubtitleStyle={setSubtitleStyle} 
            includeSubtitles={includeSubtitles}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onUpdateSlide={(updates) => activeSlideId && updateSlide(activeSlideId, updates)}
          />
          <EditorPanel 
            slide={activeSlide} 
            selectedSlideCount={selectedSlideIds.length}
            onUpdate={updateSlide} 
            onGenerateAudio={handleBulkGenerateAudio} 
            onGenerateScript={handleBulkGenerateScript} 
            subtitleStyle={subtitleStyle} 
            onUpdateSubtitleStyle={setSubtitleStyle} 
            selectedVoice={selectedVoice} 
            onVoiceChange={setSelectedVoice} 
            scriptLevel={scriptLevel} 
            onScriptLevelChange={setScriptLevel}
            scriptLength={scriptLength}
            onScriptLengthChange={setScriptLength}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
          />
        </main>
      </div>

      {generationState.isExporting && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[10000] flex items-center justify-center p-8 transition-all animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-gray-900 border border-white/10 rounded-[2.5rem] p-12 shadow-[0_0_80px_rgba(0,0,0,0.8)] ring-1 ring-white/10 text-center">
             <div className="flex flex-col items-center">
              <div className="mb-10 relative">
                 <div className="w-24 h-24 border-[8px] border-brand-500/10 border-t-brand-500 rounded-full animate-spin"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 bg-brand-500/20 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-brand-400 animate-pulse"><path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" /><path d="M3.276 12.294a.75.75 0 000 1.32l9.75 5.25a.75.75 0 00.712 0l9.75-5.25a.75.75 0 000-1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25z" /><path d="M3.276 16.794a.75.75 0 000 1.32l9.75 5.25a.75.75 0 00.712 0l9.75-5.25a.75.75 0 000-1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25z" /></svg>
                    </div>
                 </div>
              </div>
              <h3 className="text-3xl font-black mb-4 text-white tracking-tight">비디오 생성 중</h3>
              <div className="bg-white/5 border border-white/5 px-4 py-2 rounded-lg mb-10 h-10 flex items-center justify-center min-w-[300px]">
                <p className="text-sm font-semibold text-gray-300">{generationState.statusMessage || '잠시만 기다려 주세요...'}</p>
              </div>
              <div className="w-full bg-white/5 h-5 rounded-full overflow-hidden mb-4 relative shadow-inner p-1">
                <div className="bg-gradient-to-r from-brand-600 via-indigo-500 to-brand-400 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_30px_rgba(99,102,241,0.8)]" style={{ width: `${Math.round(generationState.progress)}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
