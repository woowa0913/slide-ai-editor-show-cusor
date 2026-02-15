
export interface Slide {
  id: string;
  imageUrl: string;
  script: string;
  subtitle: string;
  audioData: AudioBuffer | null; // Decoded audio for playback
  isGeneratingAudio: boolean;
  visualElements: VisualElement[]; // Detected objects/text regions with animations
}

export enum AspectRatio {
  Video16_9 = '16:9',
  Square1_1 = '1:1',
  Portrait9_16 = '9:16',
  Original = 'Original',
  Top = 'Top (Subtitle Above)', // New
  Bottom = 'Bottom (Subtitle Below)', // New
}

export interface SubtitleStyle {
  fontSize: number; // Base size relative to 720p height
  fontFamily: string;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  verticalPosition: number; // Percentage from top (0-100)
  highlightColor: string; // New for rich text highlight
}

export interface ProjectSettings {
  title: string;
  aspectRatio: AspectRatio;
  bgmVolume: number;
}

export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export interface GenerationState {
  isExporting: boolean;
  progress: number; // 0-100
  statusMessage: string;
}

export type ScriptLevel = 'elementary' | 'new_hire' | 'employee' | 'team_leader' | 'executive' | 'customer';
export type ScriptLength = 'short' | 'medium' | 'long' | 'detailed';

// --- Animation Types ---

export type AnimationType = 'none' | 'fadeIn' | 'zoomIn' | 'highlight' | 'slideUp';

export interface VisualElement {
  id: string;
  label: string; // e.g., "Title", "Product", "Background"
  rect: { x: number; y: number; w: number; h: number }; // Percentage (0-100)
  animation: AnimationType;
  startTime: number; // 0.0 to 1.0 (relative to audio duration)
  duration: number; // seconds
}
