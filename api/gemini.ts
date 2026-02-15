import { GoogleGenAI, Modality, Type } from '@google/genai';

type ScriptLevel = 'elementary' | 'new_hire' | 'employee' | 'team_leader' | 'executive' | 'customer';
type ScriptLength = 'short' | 'medium' | 'long' | 'detailed';
type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

type Action = 'generateScript' | 'generateSpeech' | 'generateAnimations';

interface VercelRequestLike {
  method?: string;
  body?: unknown;
}

interface VercelResponseLike {
  status: (code: number) => VercelResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

const cleanJsonResponse = (text: string): string => text.replace(/```json\s?|```/g, '').trim();

const getApiKey = (): string => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY.');
  return apiKey;
};

const parseBody = <T,>(body: unknown): T => {
  if (typeof body === 'string') return JSON.parse(body) as T;
  return (body ?? {}) as T;
};

const getAudiencePrompt = (level: ScriptLevel): string => {
  switch (level) {
    case 'elementary':
      return '초등학생 (쉽고 친근하며 이해하기 쉬운 단어 사용, 존댓말)';
    case 'new_hire':
      return '신입사원 (친절하게 안내하고 동기를 부여하는 톤, 회사 용어 설명)';
    case 'employee':
      return '일반 임직원 (명확하고 정보 전달 중심, 표준 비즈니스 매너)';
    case 'team_leader':
      return '팀장급 (핵심 성과와 전략적 방향성을 강조, 보고하는 느낌)';
    case 'executive':
      return '경영진 (매우 간결하고 결론 중심, 인사이트 강조, 격식 있음)';
    case 'customer':
      return '고객 (설득력 있고 혜택을 강조하는 마케팅 톤, 정중함)';
    default:
      return '일반 대중';
  }
};

const getLengthPrompt = (length: ScriptLength): string => {
  switch (length) {
    case 'short':
      return '매우 짧게 (1문장, 핵심만)';
    case 'medium':
      return '보통 길이 (2~3문장)';
    case 'long':
      return '길게 (4~5문장, 상세 설명)';
    case 'detailed':
      return '아주 상세하게 (슬라이드의 모든 텍스트와 요소를 빠짐없이 설명)';
    default:
      return '보통 길이 (2~3문장)';
  }
};

const handleGenerateScript = async (
  ai: GoogleGenAI,
  payload: { base64Image: string; level: ScriptLevel; length: ScriptLength }
) => {
  const prompt = `이 이미지를 시각적으로 분석하여 ${getAudiencePrompt(payload.level)}을(를) 대상으로 한 프레젠테이션 대본을 작성해 주세요.
길이는 ${getLengthPrompt(payload.length)}로 작성해야 합니다.
중요한 단어 하나를 강조하고 싶다면 해당 단어를 *별표*로 감싸주세요 (예: 핵심은 *비용 절감* 입니다).

반드시 다음 JSON 형식을 엄격히 지켜주세요:
{
  "script": "나레이션 전체 텍스트 (강조 표시 포함 가능)",
  "subtitle": "화면 하단 자막용 요약 텍스트 (1줄, 강조 표시 포함 가능)"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: payload.base64Image } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          script: { type: Type.STRING },
          subtitle: { type: Type.STRING }
        },
        required: ['script', 'subtitle']
      }
    }
  });

  const rawText = response.text;
  if (!rawText) throw new Error('Empty response');
  const result = JSON.parse(cleanJsonResponse(rawText)) as { script?: string; subtitle?: string };
  return {
    script: result.script || '대본을 생성할 수 없습니다.',
    subtitle: result.subtitle || '자막 없음'
  };
};

const handleGenerateSpeech = async (
  ai: GoogleGenAI,
  payload: { text: string; voiceName: VoiceName }
) => {
  const cleanText = payload.text.replace(/\*/g, '').trim();
  if (!cleanText || cleanText.includes('분석 중') || cleanText.startsWith('오류')) {
    return { audioBase64: null };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: cleanText }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: payload.voiceName }
        }
      }
    }
  });

  return {
    audioBase64: response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null
  };
};

const handleGenerateAnimations = async (
  ai: GoogleGenAI,
  payload: { base64Image: string; script: string }
) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: payload.base64Image } },
        {
          text: `
Analyze this slide image and the provided narration script.
Identify 3 to 5 distinct visual elements (e.g., Title text, Main Object, Background, Charts) that should be animated.
IMPORTANT: The bounding box (rect) MUST be strictly within the range of 0 to 100.

Script: "${payload.script}"

Return JSON array of objects.
`
        }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            rect: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                w: { type: Type.NUMBER },
                h: { type: Type.NUMBER }
              },
              required: ['x', 'y', 'w', 'h']
            },
            animation: { type: Type.STRING, enum: ['fadeIn', 'zoomIn', 'highlight', 'slideUp', 'none'] },
            startTime: { type: Type.NUMBER },
            duration: { type: Type.NUMBER }
          },
          required: ['label', 'rect', 'animation', 'startTime']
        }
      }
    }
  });

  const rawText = response.text;
  if (!rawText) return { elements: [] as unknown[] };
  return { elements: JSON.parse(cleanJsonResponse(rawText)) as unknown[] };
};

export default async function handler(req: VercelRequestLike, res: VercelResponseLike): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = parseBody<{ action: Action; payload: unknown }>(req.body);
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    if (body.action === 'generateScript') {
      const result = await handleGenerateScript(ai, body.payload as { base64Image: string; level: ScriptLevel; length: ScriptLength });
      res.status(200).json(result);
      return;
    }

    if (body.action === 'generateSpeech') {
      const result = await handleGenerateSpeech(ai, body.payload as { text: string; voiceName: VoiceName });
      res.status(200).json(result);
      return;
    }

    if (body.action === 'generateAnimations') {
      const result = await handleGenerateAnimations(ai, body.payload as { base64Image: string; script: string });
      res.status(200).json(result);
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    res.status(500).json({ error: message });
  }
}
