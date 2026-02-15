
import { VoiceName, ScriptLevel, ScriptLength, VisualElement } from '../types';

type GeminiAction = 'generateScript' | 'generateSpeech' | 'generateAnimations';

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
    throw new Error(message);
  }
  return await response.json() as TResponse;
};

// Generate Script for an Image
export const generateSlideScript = async (base64Image: string, level: ScriptLevel, length: ScriptLength, context?: string): Promise<{script: string, subtitle: string}> => {
  return postGemini<{ script: string; subtitle: string }, { base64Image: string; level: ScriptLevel; length: ScriptLength; context?: string }>(
    'generateScript',
    { base64Image, level, length, context }
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
  const result = await postGemini<{ elements: any[] }, { base64Image: string; script: string }>(
    'generateAnimations',
    { base64Image, script }
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