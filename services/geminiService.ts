
import { VoiceName, ScriptLevel, ScriptLength, VisualElement } from '../types';

type GeminiAction = 'generateScript' | 'generateSpeech' | 'generateAnimations';
const MAX_IMAGE_BYTES_FOR_REQUEST = 1_500_000;

const estimateBase64Bytes = (base64: string): number => Math.ceil((base64.length * 3) / 4);

const parseImageInput = (input: string): { mimeType: string; base64: string } => {
  const dataUrlMatch = input.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1], base64: dataUrlMatch[2] };
  }

  if (input.startsWith('iVBOR')) return { mimeType: 'image/png', base64: input };
  if (input.startsWith('/9j/')) return { mimeType: 'image/jpeg', base64: input };
  if (input.startsWith('R0lGOD')) return { mimeType: 'image/gif', base64: input };
  if (input.startsWith('UklGR')) return { mimeType: 'image/webp', base64: input };

  return { mimeType: 'image/jpeg', base64: input };
};

const loadImageFromBase64 = (base64: string, mimeType: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = `data:${mimeType};base64,${base64}`;
  });

const compressImageBase64ForApi = async (imageInput: string): Promise<string> => {
  const parsed = parseImageInput(imageInput);
  if (estimateBase64Bytes(parsed.base64) <= MAX_IMAGE_BYTES_FOR_REQUEST) return parsed.base64;

  try {
    const img = await loadImageFromBase64(parsed.base64, parsed.mimeType);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return parsed.base64;

    const maxDim = 1600;
    const imgScale = Math.min(1, maxDim / Math.max(img.width, img.height));
    let width = Math.max(1, Math.floor(img.width * imgScale));
    let height = Math.max(1, Math.floor(img.height * imgScale));

    const renderAt = (w: number, h: number, quality: number): string => {
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', quality).split(',')[1] || parsed.base64;
    };

    const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.42];
    let best = renderAt(width, height, qualitySteps[0]);
    for (const q of qualitySteps) {
      const candidate = renderAt(width, height, q);
      best = candidate;
      if (estimateBase64Bytes(candidate) <= MAX_IMAGE_BYTES_FOR_REQUEST) return candidate;
    }

    // If quality reduction alone is not enough, continue scaling down.
    while (estimateBase64Bytes(best) > MAX_IMAGE_BYTES_FOR_REQUEST && width > 480 && height > 270) {
      width = Math.max(480, Math.floor(width * 0.8));
      height = Math.max(270, Math.floor(height * 0.8));
      best = renderAt(width, height, 0.62);
    }

    if (estimateBase64Bytes(best) > MAX_IMAGE_BYTES_FOR_REQUEST) {
      throw new Error('IMAGE_TOO_LARGE');
    }

    return best;
  } catch {
    throw new Error('이미지 용량이 너무 커서 요청할 수 없습니다. 해상도를 낮춘 이미지를 사용해 주세요.');
  }
};

const postGemini = async <TResponse, TPayload>(action: GeminiAction, payload: TPayload): Promise<TResponse> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    let retryAfterSec: number | undefined;
    try {
      const json = await response.json() as { error?: string; code?: string; retryAfterSec?: number };
      if (json.error) message = json.error;
      code = json.code;
      retryAfterSec = json.retryAfterSec;
    } catch {
      // ignore parse errors; fallback to status-based message
    }
    if (code) {
      const retryText = retryAfterSec ? ` (약 ${retryAfterSec}초 후 재시도)` : '';
      message = `[${code}] ${message}${retryText}`;
    }
    if (response.status === 413) {
      message = '이미지 용량이 커서 요청이 거부되었습니다. 이미지 해상도를 낮추거나 슬라이드를 다시 업로드해 주세요.';
    }
    throw new Error(message);
  }
  return await response.json() as TResponse;
};

// Generate Script for an Image
export const generateSlideScript = async (base64Image: string, level: ScriptLevel, length: ScriptLength, context?: string): Promise<{script: string, subtitle: string}> => {
  const optimizedImage = await compressImageBase64ForApi(base64Image);
  return postGemini<{ script: string; subtitle: string }, { base64Image: string; level: ScriptLevel; length: ScriptLength; context?: string }>(
    'generateScript',
    { base64Image: optimizedImage, level, length, context }
  );
};

// Generate TTS Audio
export const generateSpeech = async (text: string, voiceName: VoiceName): Promise<string | null> => {
  const cleanText = text.replace(/\*/g, '').trim();
  if (!cleanText || cleanText.includes("분석 중") || cleanText.startsWith("오류")) {
    return null;
  }

  try {
    const result = await postGemini<{ audioBase64: string | null }, { text: string; voiceName: VoiceName }>(
      'generateSpeech',
      { text: cleanText, voiceName }
    );
    return result.audioBase64;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
};

// Generate Visual Elements & Animations
export const generateSlideAnimations = async (base64Image: string, script: string): Promise<VisualElement[]> => {
  const optimizedImage = await compressImageBase64ForApi(base64Image);
  const shortenedScript = script.length > 2000 ? script.slice(0, 2000) : script;
  const result = await postGemini<{ elements: any[] }, { base64Image: string; script: string }>(
    'generateAnimations',
    { base64Image: optimizedImage, script: shortenedScript }
  );
  const elements = Array.isArray(result.elements) ? result.elements : [];

  return elements
    .filter((el) => el && typeof el === 'object' && el.rect)
    .map((el, idx) => {
      const x = Number(el.rect.x ?? 0);
      const y = Number(el.rect.y ?? 0);
      const w = Number(el.rect.w ?? 20);
      const h = Number(el.rect.h ?? 20);
      return {
        id: `el-${Date.now()}-${idx}`,
        label: String(el.label || `Element ${idx + 1}`),
        rect: {
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y)),
          w: Math.max(1, Math.min(100 - Math.max(0, x), w)),
          h: Math.max(1, Math.min(100 - Math.max(0, y), h)),
        },
        animation: el.animation || 'none',
        startTime: Number(el.startTime ?? 0),
        duration: Number(el.duration ?? 1.5),
      } as VisualElement;
    });
};