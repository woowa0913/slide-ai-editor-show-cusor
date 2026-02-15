
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
    try {
      const json = await response.json() as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore parse errors; fallback to status-based message
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
  try {
    const result = await postGemini<{ audioBase64: string | null }, { text: string; voiceName: VoiceName }>(
      'generateSpeech',
      { text, voiceName }
    );
    return result.audioBase64;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    return null;
  }
};

// Generate Visual Elements & Animations
export const generateSlideAnimations = async (base64Image: string, script: string): Promise<VisualElement[]> => {
  try {
    const result = await postGemini<{ elements: any[] }, { base64Image: string; script: string }>(
      'generateAnimations',
      { base64Image, script }
    );
    const elements = result.elements || [];

    return elements.map((el, idx) => ({
      id: `el-${Date.now()}-${idx}`,
      label: el.label,
      // Clamp values to ensure they stay inside slide (0-100)
      rect: {
        x: Math.max(0, Math.min(100, el.rect.x)),
        y: Math.max(0, Math.min(100, el.rect.y)),
        w: Math.max(1, Math.min(100 - Math.max(0, el.rect.x), el.rect.w)),
        h: Math.max(1, Math.min(100 - Math.max(0, el.rect.y), el.rect.h)),
      },
      animation: el.animation,
      startTime: el.startTime,
      duration: el.duration || 1.5
    }));

  } catch (error) {
    console.error("Gemini Animation Error:", error);
    return [];
  }
};