
import { Slide, SubtitleStyle, AspectRatio } from '../types';
import { splitTextIntoChunks, getChunkIndexByCharacterCount } from './textUtils';

const getMediaRecorderOptions = (): { mimeType?: string } => {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser.');
  }

  const preferredMimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];

  for (const mimeType of preferredMimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType };
  }

  // Let browser choose its default if no preferred codec is supported.
  return {};
};

export const exportVideo = async (
  slides: Slide[],
  targetWidth: number,
  targetHeight: number,
  aspectRatio: AspectRatio,
  subtitleStyle: SubtitleStyle,
  onProgress: (progress: number, msg: string) => void,
  includeSubtitles: boolean
): Promise<Blob> => {

  let width = targetWidth;
  let height = targetHeight;

  // Layout Logic
  const isTopLayout = aspectRatio === AspectRatio.Top;
  const isBottomLayout = aspectRatio === AspectRatio.Bottom;
  const isSplitLayout = isTopLayout || isBottomLayout;

  if (aspectRatio === AspectRatio.Original && slides.length > 0) {
    onProgress(0, "Analyzing original dimensions...");
    const img = new Image();
    img.src = slides[0].imageUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => resolve(null); // Fallback
    });
    width = img.width % 2 === 0 ? img.width : img.width - 1;
    height = img.height % 2 === 0 ? img.height : img.height - 1;
    const maxDim = 1920;
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
      width = width % 2 === 0 ? width : width - 1;
      height = height % 2 === 0 ? height : height - 1;
    }
  } else if (isSplitLayout) {
    // Force 16:9 for Split layouts
    width = 1920;
    height = 1080;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Could not create canvas context");

  const stream = canvas.captureStream(30);
  const audioContext = new AudioContext();
  const dest = audioContext.createMediaStreamDestination();

  const combinedTracks = [
    ...stream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ];
  const combinedStream = new MediaStream(combinedTracks);
  const recorderOptions = getMediaRecorderOptions();
  const recorder = new MediaRecorder(combinedStream, recorderOptions);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Define Layout Areas
  let imgArea = { x: 0, y: 0, w: width, h: height };
  if (isTopLayout) {
    imgArea = { x: 0, y: height * 0.2, w: width, h: height * 0.8 };
  } else if (isBottomLayout) {
    imgArea = { x: 0, y: 0, w: width, h: height * 0.8 };
  }

  return new Promise(async (resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      // Cleanup AudioContext
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
      }
      resolve(blob);
    };

    recorder.start();

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      onProgress((i / slides.length) * 100, `Rendering slide ${i + 1}/${slides.length}...`);

      const img = new Image();
      img.crossOrigin = "anonymous"; // Try standard first
      img.src = slide.imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => {
          console.warn(`Failed to load image for slide ${i}. Using placeholder.`);
          // Fallback to avoid hanging
          resolve(null);
        };
      });

      let duration = 3000;
      let source: AudioBufferSourceNode | null = null;

      if (slide.audioData) {
        duration = slide.audioData.duration * 1000;
        source = audioContext.createBufferSource();
        source.buffer = slide.audioData;
        source.connect(dest);
        source.start(audioContext.currentTime);
      }

      const scriptText = slide.script || "";
      const textChunks = splitTextIntoChunks(scriptText);
      const totalChunks = textChunks.length;
      const startTime = performance.now();

      await new Promise<void>((resolveFrame) => {
        const drawFrame = () => {
          const now = performance.now();
          const elapsed = now - startTime;
          const progress = Math.min(Math.max(elapsed / duration, 0), 1);

          // 1. Clear & Background
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);

          // Calculate Scale for Image Area
          const scale = Math.min(imgArea.w / img.width, imgArea.h / img.height);
          const imgW = img.width * scale;
          const imgH = img.height * scale;
          const x = imgArea.x + (imgArea.w / 2) - (imgW / 2);
          const y = imgArea.y + (imgArea.h / 2) - (imgH / 2);

          // Draw Base Image (Full Brightness)
          ctx.drawImage(img, x, y, imgW, imgH);

          // 2. Animations
          if (slide.visualElements && slide.visualElements.length > 0) {
            slide.visualElements.forEach(el => {
              const isActive = progress >= el.startTime;
              if (!isActive) return;

              const relativeTime = Math.max(0, (progress - el.startTime) * (duration / 1000));
              const animProgress = Math.min(Math.max(relativeTime / el.duration, 0), 1);

              // Percentage relative to original image size
              const elX = x + (el.rect.x / 100) * imgW;
              const elY = y + (el.rect.y / 100) * imgH;
              const elW = (el.rect.w / 100) * imgW;
              const elH = (el.rect.h / 100) * imgH;

              const srcX = (el.rect.x / 100) * img.width;
              const srcY = (el.rect.y / 100) * img.height;
              const srcW = (el.rect.w / 100) * img.width;
              const srcH = (el.rect.h / 100) * img.height;

              ctx.save();
              if (el.animation === 'fadeIn') {
                ctx.globalAlpha = animProgress;
              } else if (el.animation === 'zoomIn') {
                const zScale = 0.8 + (animProgress * 0.2);
                ctx.translate(elX + elW / 2, elY + elH / 2);
                ctx.scale(zScale, zScale);
                ctx.translate(-(elX + elW / 2), -(elY + elH / 2));
                ctx.globalAlpha = animProgress;
              } else if (el.animation === 'highlight') {
                const pulse = Math.sin(animProgress * Math.PI);
                ctx.filter = `brightness(${100 + pulse * 50}%)`;
              } else if (el.animation === 'slideUp') {
                const translateY = (1 - animProgress) * (imgH * 0.05);
                ctx.translate(0, translateY);
                ctx.globalAlpha = animProgress;
              }
              ctx.drawImage(img, srcX, srcY, srcW, srcH, elX, elY, elW, elH);
              ctx.restore();
            });
          }

          // 3. Subtitles
          let currentSubtitle = slide.subtitle;
          if (slide.audioData && scriptText && totalChunks > 0) {
            const chunkIndex = getChunkIndexByCharacterCount(textChunks, progress);
            currentSubtitle = textChunks[chunkIndex];
          }

          if (includeSubtitles && currentSubtitle) {
            const scaleFactor = Math.min(width, height) / 720;
            const fontSize = subtitleStyle.fontSize * scaleFactor;

            ctx.font = `bold ${fontSize}px ${subtitleStyle.fontFamily}, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let textY = height * (subtitleStyle.verticalPosition / 100);
            // Override subtitle position for split layouts
            if (isTopLayout) textY = height * 0.1;
            if (isBottomLayout) textY = height * 0.9;

            const textX = width / 2;

            // Rich Text Rendering Logic (Simple * Highlight)
            const parts = currentSubtitle.split(/(\*[^*]+\*)/g);
            let totalWidth = 0;
            const measures = parts.map(p => {
              const isHighlight = p.startsWith('*') && p.endsWith('*');
              const text = isHighlight ? p.slice(1, -1) : p;
              ctx.font = isHighlight ? `bold ${fontSize * 1.2}px ${subtitleStyle.fontFamily}, sans-serif` : `bold ${fontSize}px ${subtitleStyle.fontFamily}, sans-serif`;
              const m = ctx.measureText(text);
              totalWidth += m.width;
              return { text, width: m.width, isHighlight };
            });

            let currentX = textX - totalWidth / 2;

            // Draw Background
            const textHeight = fontSize * 1.2;
            const padding = fontSize * 0.5;
            if (subtitleStyle.backgroundOpacity > 0) {
              ctx.fillStyle = hexToRgba(subtitleStyle.backgroundColor, subtitleStyle.backgroundOpacity);
              ctx.fillRect(
                currentX - padding,
                textY - textHeight / 2 - padding / 2,
                totalWidth + padding * 2,
                textHeight + padding
              );
            }

            // Draw Text Parts
            measures.forEach(m => {
              ctx.fillStyle = m.isHighlight ? (subtitleStyle.highlightColor || 'yellow') : subtitleStyle.color;
              ctx.font = m.isHighlight ? `bold ${fontSize * 1.2}px ${subtitleStyle.fontFamily}, sans-serif` : `bold ${fontSize}px ${subtitleStyle.fontFamily}, sans-serif`;

              if (subtitleStyle.backgroundOpacity < 0.3) {
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 4;
                ctx.lineWidth = fontSize * 0.05;
                ctx.strokeStyle = 'black';
                ctx.strokeText(m.text, currentX + m.width / 2, textY);
              } else {
                ctx.shadowColor = 'transparent';
              }

              ctx.fillText(m.text, currentX + m.width / 2, textY);
              currentX += m.width;
            });
          }

          if (elapsed < duration) requestAnimationFrame(drawFrame);
          else resolveFrame();
        };
        drawFrame();
      });
      if (source) { source.stop(); source.disconnect(); }
    }
    recorder.stop();
  });
};
