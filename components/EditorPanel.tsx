
import React, { useState, useRef } from 'react';
import { Slide, VoiceName, ScriptLevel, ScriptLength, SubtitleStyle, VisualElement, AnimationType } from '../types';
import { VOICES } from '../constants';
import { base64ToBytes, decodeAudioData } from '../services/audioUtils';

const loadGeminiService = () => import('../services/geminiService');

interface EditorPanelProps {
  slide: Slide | undefined;
  // selectedSlideIds passed to know if bulk action applies
  selectedSlideCount: number;
  onUpdate: (id: string, updates: Partial<Slide>) => void;
  // Updated signatures to handle potential bulk triggers from parent, but here we trigger the parent handler
  onGenerateAudio: () => void;
  onGenerateScript: () => void;
  subtitleStyle: SubtitleStyle;
  onUpdateSubtitleStyle: (style: SubtitleStyle) => void;
  // Lifted State Props
  selectedVoice: VoiceName;
  onVoiceChange: (voice: VoiceName) => void;
  scriptLevel: ScriptLevel;
  onScriptLevelChange: (level: ScriptLevel) => void;
  scriptLength: ScriptLength;
  onScriptLengthChange: (length: ScriptLength) => void;
  // Animation Selection
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  // Tab State
  activeTab: 'subtitle' | 'animation';
  onTabChange: (tab: 'subtitle' | 'animation') => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  slide,
  selectedSlideCount,
  onUpdate,
  onGenerateAudio,
  onGenerateScript,
  subtitleStyle,
  onUpdateSubtitleStyle,
  selectedVoice,
  onVoiceChange,
  scriptLevel,
  onScriptLevelChange,
  scriptLength,
  onScriptLengthChange,
  selectedElementId,
  onSelectElement,
  activeTab,
  onTabChange
}) => {
  // const [activeTab, setActiveTab] = useState<'subtitle' | 'animation'>('subtitle'); // Lifted up

  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [isAnimGenerating, setIsAnimGenerating] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleAnimGen = async () => {
    if (!slide) return;
    setIsAnimGenerating(true);
    try {
      const { generateSlideAnimations } = await loadGeminiService();
      const elements = await generateSlideAnimations(slide.imageUrl, slide.script || "Presentation slide");
      onUpdate(slide.id, { visualElements: elements });
      if (elements.length > 0) {
        onSelectElement(elements[0].id);
      } else {
        onSelectElement(null);
        alert("감지된 요소가 없습니다. 대본을 보강하거나 이미지 품질을 높여 다시 시도해 주세요.");
      }
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Unknown error";
      alert(`애니메이션 생성 실패\n${message}`);
    } finally {
      setIsAnimGenerating(false);
    }
  };

  const handlePreviewVoice = async () => {
    if (isPreviewingVoice) return;
    setIsPreviewingVoice(true);
    try {
      const { generateSpeech } = await loadGeminiService();
      const base64 = await generateSpeech("This is a preview of the voice.", selectedVoice);
      if (base64) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await decodeAudioData(base64ToBytes(base64), ctx);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        source.onended = () => {
          setIsPreviewingVoice(false);
          if (ctx.state !== 'closed') ctx.close();
        };
      } else {
        setIsPreviewingVoice(false);
      }
    } catch (e) {
      console.error(e);
      alert("음성 미리보기에 실패했습니다. 로컬에서는 `vercel dev` 실행 및 `GEMINI_API_KEY` 설정이 필요합니다.");
      setIsPreviewingVoice(false);
    }
  };

  const handleToggleRecord = async () => {
    if (!slide) return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const arrayBuffer = await audioBlob.arrayBuffer();
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

          try {
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            onUpdate(slide.id, { audioData: audioBuffer });
          } catch (e) {
            console.error("Recording process error", e);
            alert("오디오 처리 중 오류가 발생했습니다.");
          } finally {
            if (ctx.state !== 'closed') ctx.close();
            stream.getTracks().forEach(track => track.stop());
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access error:", err);
        alert("마이크 권한이 필요합니다.");
      }
    }
  };

  const updateStyle = (field: keyof SubtitleStyle, value: any) => {
    onUpdateSubtitleStyle({ ...subtitleStyle, [field]: value });
  };

  const updateElement = (elId: string, updates: Partial<VisualElement>) => {
    if (!slide || !slide.visualElements) return;
    const newElements = slide.visualElements.map(el => el.id === elId ? { ...el, ...updates } : el);
    onUpdate(slide.id, { visualElements: newElements });
  };

  const removeElement = (elId: string) => {
    if (!slide || !slide.visualElements) return;
    const newElements = slide.visualElements.filter(el => el.id !== elId);
    onUpdate(slide.id, { visualElements: newElements });
    onSelectElement(null);
  };

  if (!slide) return <div className="h-72 bg-gray-900 border-t border-gray-800 p-8 flex items-center justify-center text-gray-600">Select a slide to edit</div>;

  const selectedElement = slide.visualElements?.find(el => el.id === selectedElementId);
  const bulkMode = selectedSlideCount > 1;

  return (
    <div className="h-80 bg-gray-900 border-t border-gray-800 flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'subtitle' ? 'border-brand-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          onClick={() => onTabChange('subtitle')}
        >
          자막 편집 (Subtitle)
        </button>
        <button
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'animation' ? 'border-brand-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          onClick={() => onTabChange('animation')}
        >
          애니메이션 편집 (Animation)
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'subtitle' ? (
          /* SUBTITLE & AUDIO EDITOR */
          <div className="flex-1 flex flex-col md:flex-row w-full">
            {/* Script Area */}
            <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-gray-800 flex flex-col gap-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  Narration Script
                  {bulkMode && <span className="bg-brand-900 text-brand-300 px-2 py-0.5 rounded-full text-[10px] border border-brand-700">{selectedSlideCount} Slides Selected</span>}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    className="bg-gray-800 border border-gray-700 text-xs rounded px-2 py-1 focus:ring-brand-500 text-gray-300 outline-none w-24"
                    value={scriptLevel}
                    onChange={(e) => onScriptLevelChange(e.target.value as ScriptLevel)}
                  >
                    <option value="elementary">초등학생</option>
                    <option value="new_hire">신입사원</option>
                    <option value="employee">임직원</option>
                    <option value="team_leader">팀장</option>
                    <option value="executive">경영진</option>
                    <option value="customer">고객</option>
                  </select>
                  <select
                    className="bg-gray-800 border border-gray-700 text-xs rounded px-2 py-1 focus:ring-brand-500 text-gray-300 outline-none w-20"
                    value={scriptLength}
                    onChange={(e) => onScriptLengthChange(e.target.value as ScriptLength)}
                  >
                    <option value="short">짧게</option>
                    <option value="medium">보통</option>
                    <option value="long">길게</option>
                    <option value="detailed">상세</option>
                  </select>
                  <button
                    onClick={onGenerateScript}
                    className={`text-xs px-3 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white flex items-center gap-1 transition-colors`}
                  >
                    {bulkMode ? `Generate All (${selectedSlideCount})` : "Generate"}
                  </button>
                </div>
              </div>
              <textarea
                className="flex-1 bg-gray-800 border-gray-700 rounded-md p-3 text-sm text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none leading-relaxed font-mono"
                placeholder="Enter text... (Tip: Wrap text in *asterisks* to highlight)"
                value={slide.script}
                onChange={(e) => onUpdate(slide.id, { script: e.target.value })}
              />
              <div className="flex items-center gap-3">
                <select
                  className="bg-gray-800 border-gray-700 text-sm rounded px-3 py-1.5 focus:ring-brand-500 outline-none"
                  value={selectedVoice}
                  onChange={(e) => onVoiceChange(e.target.value as VoiceName)}
                >
                  {VOICES.map(v => <option key={v.name} value={v.name}>{v.name} ({v.gender}, {v.style})</option>)}
                </select>

                <button
                  onClick={handlePreviewVoice}
                  disabled={isPreviewingVoice}
                  className="p-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300"
                >
                  Preview
                </button>

                <button
                  onClick={onGenerateAudio}
                  className={`px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-all flex-1 justify-center bg-brand-600 hover:bg-brand-500 text-white`}
                >
                  {bulkMode ? `Generate Voice All (${selectedSlideCount})` : "Generate Voice"}
                </button>

                <button
                  onClick={handleToggleRecord}
                  className={`px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-all
                     ${isRecording ? 'bg-red-500/10 text-red-400 border border-red-500/50' : 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300'}`}
                >
                  {isRecording ? "Stop" : "Record"}
                </button>
              </div>
            </div>

            {/* Subtitle Style */}
            <div className="w-full md:w-1/3 p-6 flex flex-col gap-5 bg-gray-900/50 overflow-y-auto custom-scrollbar">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-2">Subtitle Styles</label>

              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Vertical Position</span>
                    <span>{Math.round(subtitleStyle.verticalPosition)}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    value={subtitleStyle.verticalPosition}
                    onChange={(e) => updateStyle('verticalPosition', Number(e.target.value))}
                    className="w-full accent-brand-500 bg-gray-700 h-1.5 rounded-full appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Font Size</span>
                    <span>{subtitleStyle.fontSize}px</span>
                  </div>
                  <input
                    type="range" min="10" max="100"
                    value={subtitleStyle.fontSize}
                    onChange={(e) => updateStyle('fontSize', Number(e.target.value))}
                    className="w-full accent-brand-500 bg-gray-700 h-1.5 rounded-full appearance-none cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 block">Text Color</label>
                    <div className="flex items-center gap-2 bg-gray-800 p-1.5 rounded border border-gray-700">
                      <input
                        type="color"
                        value={subtitleStyle.color}
                        onChange={(e) => updateStyle('color', e.target.value)}
                        className="w-6 h-6 rounded bg-transparent cursor-pointer border-none p-0"
                      />
                      <span className="text-xs text-gray-300 uppercase">{subtitleStyle.color}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 block">Bg Color</label>
                    <div className="flex items-center gap-2 bg-gray-800 p-1.5 rounded border border-gray-700">
                      <input
                        type="color"
                        value={subtitleStyle.backgroundColor}
                        onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                        className="w-6 h-6 rounded bg-transparent cursor-pointer border-none p-0"
                      />
                      <span className="text-xs text-gray-300 uppercase">{subtitleStyle.backgroundColor}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-500 block">Highlight Color (*text*)</label>
                  <div className="flex items-center gap-2 bg-gray-800 p-1.5 rounded border border-gray-700">
                    <input
                      type="color"
                      value={subtitleStyle.highlightColor || '#ffff00'}
                      onChange={(e) => updateStyle('highlightColor', e.target.value)}
                      className="w-6 h-6 rounded bg-transparent cursor-pointer border-none p-0"
                    />
                    <span className="text-xs text-gray-300 uppercase">{subtitleStyle.highlightColor || '#ffff00'}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Background Opacity</span>
                    <span>{Math.round(subtitleStyle.backgroundOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.1"
                    value={subtitleStyle.backgroundOpacity}
                    onChange={(e) => updateStyle('backgroundOpacity', Number(e.target.value))}
                    className="w-full accent-brand-500 bg-gray-700 h-1.5 rounded-full appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ANIMATION EDITOR */
          <div className="flex-1 flex flex-col md:flex-row w-full">
            {/* Element List & Auto Gen */}
            <div className="w-full md:w-1/3 border-r border-gray-800 p-6 flex flex-col gap-4 bg-gray-900/50">
              <button
                onClick={handleAnimGen}
                disabled={isAnimGenerating}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-brand-600 hover:from-purple-500 hover:to-brand-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isAnimGenerating ? "Analyzing..." : "Auto-Generate Animations"}
              </button>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 mt-2">
                <h4 className="text-xs font-bold text-gray-500 uppercase">Detected Elements</h4>
                {(!slide.visualElements || slide.visualElements.length === 0) && (
                  <p className="text-sm text-gray-600 italic p-2">No elements detected. Click Auto-Generate.</p>
                )}
                {slide.visualElements?.map((el, idx) => (
                  <div
                    key={el.id}
                    onClick={() => onSelectElement(el.id)}
                    className={`p-3 rounded border cursor-pointer flex items-center justify-between transition-all
                       ${selectedElementId === el.id ? 'bg-brand-500/20 border-brand-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-gray-900 px-1.5 py-0.5 rounded font-mono text-gray-500">{idx + 1}</span>
                      <span className="text-sm font-medium">{el.label}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider opacity-70 bg-black/30 px-1.5 py-0.5 rounded">{el.animation}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Properties Editor */}
            <div className="flex-1 p-6 flex flex-col gap-5 bg-gray-900">
              {selectedElement ? (
                <>
                  <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <span className="text-brand-400">Editing:</span> {selectedElement.label}
                    </h3>
                    <button onClick={() => removeElement(selectedElement.id)} className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1">Delete</button>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs text-gray-500 uppercase font-bold">Animation Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['none', 'fadeIn', 'zoomIn', 'highlight', 'slideUp'].map((type) => (
                          <button
                            key={type}
                            onClick={() => updateElement(selectedElement.id, { animation: type as AnimationType })}
                            className={`px-3 py-2 text-xs rounded border transition-all ${selectedElement.animation === type ? 'bg-brand-600 border-brand-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Start Time</span>
                          <span>{Math.round(selectedElement.startTime * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.05"
                          value={selectedElement.startTime}
                          onChange={(e) => updateElement(selectedElement.id, { startTime: Number(e.target.value) })}
                          className="w-full accent-brand-500 bg-gray-700 h-1.5 rounded-full"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Duration</span>
                          <span>{selectedElement.duration.toFixed(1)}s</span>
                        </div>
                        <input
                          type="range" min="0.5" max="5" step="0.1"
                          value={selectedElement.duration}
                          onChange={(e) => updateElement(selectedElement.id, { duration: Number(e.target.value) })}
                          className="w-full accent-brand-500 bg-gray-700 h-1.5 rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                  <p>Select an element to edit.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
