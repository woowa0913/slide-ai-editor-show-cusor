// Utility to split text into chunks based on newlines as requested by the user.
// This allows manual control over subtitle timing via line breaks in the script.
export const splitTextIntoChunks = (text: string, maxChars: number = 45): string[] => {
  if (!text) return [];
  
  // Split strictly by newlines to respect user formatting
  // Filter out empty lines to avoid blank subtitles causing sync gaps
  return text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
};

// Calculates which chunk should be displayed at a specific progress (0.0 - 1.0)
// based on the length of characters in each chunk relative to the total length.
// This provides better lip-sync approximation than equal time distribution.
export const getChunkIndexByCharacterCount = (chunks: string[], progress: number): number => {
  if (chunks.length === 0) return 0;
  if (progress >= 1) return chunks.length - 1;
  if (progress <= 0) return 0;

  // Calculate total characters (weight)
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  
  // Find target character position
  const targetCharIndex = progress * totalLength;
  
  let runningCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    runningCount += chunks[i].length;
    // If the running count exceeds the target, this is our chunk
    // We add a small buffer logic or just return i
    if (runningCount >= targetCharIndex) {
      return i;
    }
  }
  
  return chunks.length - 1;
};