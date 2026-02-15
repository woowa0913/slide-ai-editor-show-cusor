
import { Slide, VoiceName } from './types';

export const PLACEHOLDER_IMAGE = "https://picsum.photos/1280/720";

export const DEFAULT_SCRIPT = "Welcome to Slide AI Editor. This is an auto-generated slide description.";
export const DEFAULT_SUBTITLE = "Welcome to Slide AI Editor.";

export const VOICES = [
  { name: VoiceName.Puck, gender: 'Male', style: 'Soft' },
  { name: VoiceName.Charon, gender: 'Male', style: 'Deep' },
  { name: VoiceName.Kore, gender: 'Female', style: 'Calm' },
  { name: VoiceName.Fenrir, gender: 'Male', style: 'Intense' },
  { name: VoiceName.Zephyr, gender: 'Female', style: 'Bright' },
];

export const SAMPLE_SLIDES: Slide[] = [];
