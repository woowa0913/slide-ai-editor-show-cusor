
import React, { useEffect, useRef, useState } from 'react';
import { Slide, AspectRatio, SubtitleStyle, VisualElement } from '../types';
import { splitTextIntoChunks, getChunkIndexByCharacterCount } from '../services/textUtils';

interface PreviewAreaProps {
  activeSlide: Slide | undefined;
  aspectRatio: AspectRatio;
  subtitleStyle: SubtitleStyle;
  onUpdateSubtitleStyle: (style: SubtitleStyle) => void;
  includeSubtitles: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onUpdateSlide?: (updates: Partial<Slide>) => void;
}

type InteractionMode = 'none' | 'drag' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'subtitle-drag';

export const PreviewArea: React.FC<PreviewAreaProps> = ({
  activeSlide,
  aspectRatio,
  subtitleStyle,
  onUpdateSubtitleStyle,
  includeSubtitles,
  selectedElementId,
  onSelectElement,
  onUpdateSlide
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ width: number, height: number } | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [startDragPos, setStartDragPos] = useState({ x: 0, y: 0 });
  const [startElementRect, setStartElementRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [aspectRatio]);

  useEffect(() => {
    if (activeSlide && aspectRatio === AspectRatio.Original) {
      const img = new Image();
      img.src = activeSlide.imageUrl;
      img.onload = () => {
        setNaturalSize({ width: img.width, height: img.height });
      };
    } else {
      setNaturalSize(null);
    }
  }, [activeSlide, aspectRatio]);

  useEffect(() => {
    stopAudio();
    pausedTimeRef.current = 0;
    setPlaybackProgress(0);
  }, [activeSlide?.id]);

  const stopAudio = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) { }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsPlaying(false);
  };

  const playAudio = (startOffset = 0) => {
    if (!activeSlide?.audioData) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();

    stopAudio();

    const source = audioContextRef.current.createBufferSource();
    source.buffer = activeSlide.audioData;
    source.connect(audioContextRef.current.destination);

    source.onended = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      pausedTimeRef.current = 0;
      setPlaybackProgress(100);
    };

    source.start(0, startOffset);
    startTimeRef.current = audioContextRef.current.currentTime - startOffset;
    sourceRef.current = source;
    setIsPlaying(true);

    const duration = activeSlide.audioData.duration;

    const updateLoop = () => {
      if (!audioContextRef.current) return;
      const currentTime = audioContextRef.current.currentTime;
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(Math.max(elapsed / duration, 0), 1);
      setPlaybackProgress(progress * 100);
      if (elapsed < duration) {
        animationFrameRef.current = requestAnimationFrame(updateLoop);
      }
    };
    animationFrameRef.current = requestAnimationFrame(updateLoop);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      if (audioContextRef.current) {
        pausedTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
      }
      stopAudio();
    } else {
      playAudio(pausedTimeRef.current);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSlide?.audioData) return;
    const newVal = Number(e.target.value);
    setPlaybackProgress(newVal);
    const duration = activeSlide.audioData.duration;
    const newTime = (newVal / 100) * duration;
    pausedTimeRef.current = newTime;
    if (isPlaying) playAudio(newTime);
  };

  // --- INTERACTION LOGIC ---

  const getEventPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ('touches' in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  };

  const handleElementMouseDown = (e: React.MouseEvent | React.TouchEvent, id: string, mode: InteractionMode) => {
    e.stopPropagation();
    e.preventDefault();
    if (!onUpdateSlide || !activeSlide?.visualElements) return;

    const el = activeSlide.visualElements.find(v => v.id === id);
    if (!el) return;

    if (onSelectElement) onSelectElement(id);

    setInteractionMode(mode);
    setStartDragPos(getEventPos(e.nativeEvent));
    setStartElementRect({ ...el.rect });
  };

  const handleSubtitleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setInteractionMode('subtitle-drag');
    setStartDragPos(getEventPos(e.nativeEvent));
  };

  const handleGlobalMouseMove = (e: MouseEvent | TouchEvent) => {
    if (interactionMode === 'none' || !containerRef.current) return;

    const currentPos = getEventPos(e);
    const dxPx = currentPos.x - startDragPos.x;
    const dyPx = currentPos.y - startDragPos.y;

    const dx = (dxPx / containerSize.width) * 100;
    const dy = (dyPx / containerSize.height) * 100;

    if (interactionMode === 'subtitle-drag') {
      const rect = containerRef.current.getBoundingClientRect();
      const relativeY = currentPos.y - rect.top;
      let newPercent = (relativeY / rect.height) * 100;
      newPercent = Math.max(0, Math.min(100, newPercent));
      onUpdateSubtitleStyle({ ...subtitleStyle, verticalPosition: newPercent });
      return;
    }

    if (!startElementRect || !selectedElementId || !activeSlide?.visualElements || !onUpdateSlide) return;

    let newRect = { ...startElementRect };

    if (interactionMode === 'drag') {
      newRect.x = Math.max(0, Math.min(100 - newRect.w, startElementRect.x + dx));
      newRect.y = Math.max(0, Math.min(100 - newRect.h, startElementRect.y + dy));
    } else if (interactionMode === 'resize-br') {
      newRect.w = Math.max(5, Math.min(100 - newRect.x, startElementRect.w + dx));
      newRect.h = Math.max(5, Math.min(100 - newRect.y, startElementRect.h + dy));
    } else if (interactionMode === 'resize-tr') {
      newRect.y = Math.max(0, Math.min(startElementRect.y + startElementRect.h - 5, startElementRect.y + dy));
      newRect.w = Math.max(5, Math.min(100 - newRect.x, startElementRect.w + dx));
      newRect.h = Math.max(5, startElementRect.h - (newRect.y - startElementRect.y));
    } else if (interactionMode === 'resize-bl') {
      newRect.x = Math.max(0, Math.min(startElementRect.x + startElementRect.w - 5, startElementRect.x + dx));
      newRect.w = Math.max(5, startElementRect.w - (newRect.x - startElementRect.x));
      newRect.h = Math.max(5, Math.min(100 - newRect.y, startElementRect.h + dy));
    } else if (interactionMode === 'resize-tl') {
      newRect.x = Math.max(0, Math.min(startElementRect.x + startElementRect.w - 5, startElementRect.x + dx));
      newRect.y = Math.max(0, Math.min(startElementRect.y + startElementRect.h - 5, startElementRect.y + dy));
      newRect.w = Math.max(5, startElementRect.w - (newRect.x - startElementRect.x));
      newRect.h = Math.max(5, startElementRect.h - (newRect.y - startElementRect.y));
    }

    const newElements = activeSlide.visualElements.map(el =>
      el.id === selectedElementId ? { ...el, rect: newRect } : el
    );
    onUpdateSlide({ visualElements: newElements });
  };

  const handleGlobalMouseUp = () => {
    setInteractionMode('none');
  };

  useEffect(() => {
    if (interactionMode !== 'none') {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      window.addEventListener('touchmove', handleGlobalMouseMove);
      window.addEventListener('touchend', handleGlobalMouseUp);
    } else {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalMouseMove);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalMouseMove);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, [interactionMode, startDragPos, activeSlide, selectedElementId, subtitleStyle, containerSize]);

  const getAnimationStyles = (el: VisualElement) => {
    const progress = playbackProgress / 100;
    const isActive = progress >= el.startTime;
    const relativeTime = Math.max(0, (progress - el.startTime) * (activeSlide?.audioData?.duration || 1));
    const animProgress = Math.min(Math.max(relativeTime / el.duration, 0), 1);

    const styles: React.CSSProperties = {
      position: 'absolute',
      left: `${el.rect.x}%`,
      top: `${el.rect.y}%`,
      width: `${el.rect.w}%`,
      height: `${el.rect.h}%`,
      zIndex: 10,
      overflow: 'visible',
    };

    let filter = 'none';
    let transform = 'none';
    let opacity = 1;
    let boxShadow = 'none';

    if (!isActive) {
      if (el.animation === 'fadeIn' || el.animation === 'zoomIn' || el.animation === 'slideUp') {
        opacity = 0;
      }
    } else {
      if (el.animation === 'fadeIn') {
        opacity = animProgress;
      } else if (el.animation === 'zoomIn') {
        const scale = 0.8 + (animProgress * 0.2);
        transform = `scale(${scale})`;
        opacity = animProgress;
      } else if (el.animation === 'slideUp') {
        const translateY = (1 - animProgress) * 20;
        transform = `translateY(${translateY}px)`;
        opacity = animProgress;
      } else if (el.animation === 'highlight') {
        const pulse = Math.sin(animProgress * Math.PI);
        filter = `brightness(${1 + pulse * 0.3}) contrast(1.1)`;
        boxShadow = `0 0 ${20 * pulse}px rgba(255, 255, 0, ${0.5 * pulse})`;
      }
    }

    return { container: styles, inner: { filter, transform, opacity, boxShadow, transition: isPlaying ? 'none' : 'all 0.3s ease' } };
  };

  // Rich text parser for Preview
  const renderRichText = (text: string) => {
    const parts = text.split(/(\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return <span key={i} style={{ color: subtitleStyle.highlightColor || 'yellow', fontSize: '1.2em' }}>{part.slice(1, -1)}</span>;
      }
      return part;
    });
  };

  if (!activeSlide) return <div className="flex-1 bg-black text-gray-500 flex items-center justify-center">No Slide</div>;

  // Determine Layout Style
  let containerStyle: React.CSSProperties = {};
  const isPortrait = aspectRatio === AspectRatio.Portrait9_16;
  const isTopLayout = aspectRatio === AspectRatio.Top;
  const isBottomLayout = aspectRatio === AspectRatio.Bottom;

  if (aspectRatio === AspectRatio.Original && naturalSize) {
    const ratio = naturalSize.width / naturalSize.height;
    containerStyle = { aspectRatio: `${naturalSize.width} / ${naturalSize.height}`, width: ratio > 1 ? '100%' : 'auto', height: ratio > 1 ? 'auto' : '95%' };
  } else if (isTopLayout || isBottomLayout) {
    // For Top/Bottom, we assume a 16:9 canvas but render differently
    containerStyle = { width: '100%', aspectRatio: '16 / 9' };
  } else {
    containerStyle = { width: isPortrait ? 'auto' : '100%', height: isPortrait ? '95%' : 'auto', aspectRatio: isPortrait ? '9 / 16' : '16 / 9' };
  }

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const minDim = Math.min(containerSize.width, containerSize.height);
  const scale = (minDim / 720) * 0.95;
  const scaledFontSize = subtitleStyle.fontSize * scale;
  const hasAudio = Boolean(activeSlide.audioData);
  const scriptChunks = splitTextIntoChunks(activeSlide.script || "");
  const subtitleFromScript = scriptChunks.length > 0
    ? scriptChunks[getChunkIndexByCharacterCount(scriptChunks, playbackProgress / 100)] || scriptChunks[0]
    : "";
  const subtitleFromSaved = activeSlide.subtitle || "";
  const displaySubtitle = hasAudio
    ? (subtitleFromScript || subtitleFromSaved)
    : (subtitleFromSaved || subtitleFromScript);

  // For Top/Bottom Layouts, we define the "Image Area" vs "Canvas Area"
  // Top: Image is bottom 80%, subtitle top 20%.
  // Bottom: Image is top 80%, subtitle bottom 20%.
  const imgAreaStyle: React.CSSProperties = (isTopLayout || isBottomLayout) ? {
    position: 'absolute',
    left: 0,
    right: 0,
    top: isTopLayout ? '20%' : 0,
    height: '80%',
    width: '100%'
  } : { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 };

  return (
    <div className="flex-1 bg-gray-950 p-8 flex flex-col items-center justify-center relative overflow-hidden" onClick={() => onSelectElement && onSelectElement(null)}>
      <div
        ref={containerRef}
        className={`relative bg-black shadow-2xl rounded-lg overflow-hidden border border-gray-800 transition-all duration-300 group`}
        style={{ ...containerStyle, maxWidth: '100%', maxHeight: '100%' }}
      >
        {/* Image Area Wrapper */}
        <div style={imgAreaStyle} className="relative overflow-hidden">
          <img src={activeSlide.imageUrl} alt="Base" className="w-full h-full object-contain" />

          {/* Visual Elements Layer (Inside Image Area) */}
          {activeSlide.visualElements?.map((el) => {
            const { container, inner } = getAnimationStyles(el);
            const isSelected = selectedElementId === el.id;
            return (
              <div
                key={el.id}
                style={container}
                onMouseDown={(e) => handleElementMouseDown(e, el.id, 'drag')}
                className={`group/el ${isSelected ? 'z-20' : 'z-10'}`}
              >
                <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', borderRadius: '4px', ...inner }}>
                  <div style={{
                    width: `${100 / (el.rect.w / 100)}%`,
                    height: `${100 / (el.rect.h / 100)}%`,
                    position: 'absolute',
                    left: `${-el.rect.x / (el.rect.w / 100) * 100}%`,
                    top: `${-el.rect.y / (el.rect.h / 100) * 100}%`,
                  }}>
                    <img src={activeSlide.imageUrl} className="w-full h-full object-contain" alt="" />
                  </div>
                </div>
                {isSelected && (
                  <>
                    <div className="absolute inset-0 border-2 border-brand-500 pointer-events-none"></div>
                    <button
                      type="button"
                      className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-brand-400 border border-white"
                      onMouseDown={(e) => handleElementMouseDown(e, el.id, 'resize-tl')}
                      onTouchStart={(e) => handleElementMouseDown(e, el.id, 'resize-tl')}
                    />
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-brand-400 border border-white"
                      onMouseDown={(e) => handleElementMouseDown(e, el.id, 'resize-tr')}
                      onTouchStart={(e) => handleElementMouseDown(e, el.id, 'resize-tr')}
                    />
                    <button
                      type="button"
                      className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-full bg-brand-400 border border-white"
                      onMouseDown={(e) => handleElementMouseDown(e, el.id, 'resize-bl')}
                      onTouchStart={(e) => handleElementMouseDown(e, el.id, 'resize-bl')}
                    />
                    <button
                      type="button"
                      className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full bg-brand-400 border border-white"
                      onMouseDown={(e) => handleElementMouseDown(e, el.id, 'resize-br')}
                      onTouchStart={(e) => handleElementMouseDown(e, el.id, 'resize-br')}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Subtitles - Positioned globally on canvas */}
        {includeSubtitles && displaySubtitle && (
          <div
            className={`absolute left-0 right-0 text-center px-4 transition-all duration-75 z-20 cursor-ns-resize hover:bg-white/5`}
            style={{
              top: (isTopLayout && interactionMode === 'none') ? '10%' : (isBottomLayout && interactionMode === 'none') ? '90%' : `${subtitleStyle.verticalPosition}%`,
              transform: 'translateY(-50%)'
            }}
            onMouseDown={handleSubtitleMouseDown}
          >
            <span
              className="inline-block rounded-lg shadow-lg select-none pointer-events-none"
              style={{
                fontSize: `${scaledFontSize}px`,
                fontWeight: 'bold',
                fontFamily: subtitleStyle.fontFamily,
                color: subtitleStyle.color,
                backgroundColor: hexToRgba(subtitleStyle.backgroundColor, subtitleStyle.backgroundOpacity),
                padding: `${scaledFontSize * 0.25}px ${scaledFontSize * 0.5}px`
              }}
            >
              {renderRichText(displaySubtitle)}
            </span>
          </div>
        )}

        {/* Play Overlay & Controls */}
        {!isPlaying && activeSlide.audioData && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="bg-black/30 p-4 rounded-full backdrop-blur-sm pointer-events-auto cursor-pointer hover:bg-black/50 transition-all" onClick={handleTogglePlay}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-white opacity-90"><path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" /></svg>
            </div>
          </div>
        )}
        {activeSlide.audioData && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/80 to-transparent flex items-end px-3 py-2 z-40 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2 w-full">
              <button onClick={(e) => { e.stopPropagation(); handleTogglePlay(); }} className="text-white">
                {isPlaying ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" /></svg> : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>}
              </button>
              <input type="range" min="0" max="100" value={playbackProgress} onChange={handleSeek} onClick={(e) => e.stopPropagation()} className="flex-1 accent-brand-500 h-1 bg-white/20 rounded-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
