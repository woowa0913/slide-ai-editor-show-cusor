// Utility to convert Base64 string to Uint8Array
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Utility to decode raw PCM data from Gemini to AudioBuffer
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32 [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Utility to merge audio buffers (optional, for concatenation)
export function mergeAudioBuffers(ctx: AudioContext, buffers: AudioBuffer[]): AudioBuffer | null {
  if (buffers.length === 0) return null;
  
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const result = ctx.createBuffer(buffers[0].numberOfChannels, totalLength, buffers[0].sampleRate);

  let offset = 0;
  for (const buff of buffers) {
    for (let channel = 0; channel < buff.numberOfChannels; channel++) {
      result.getChannelData(channel).set(buff.getChannelData(channel), offset);
    }
    offset += buff.length;
  }
  return result;
}
