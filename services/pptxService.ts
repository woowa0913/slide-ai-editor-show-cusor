import PptxGenJS from 'pptxgenjs';
import { Slide, AspectRatio } from '../types';

export const exportPptx = async (slides: Slide[], aspectRatio: AspectRatio) => {
  const pptx = new PptxGenJS();

  // Configure layout based on aspect ratio
  // Standard 16:9 is 10 x 5.625 inches
  if (aspectRatio === AspectRatio.Portrait9_16) {
    // 9:16 -> width 5.625, height 10
    pptx.defineLayout({ name: 'PORTRAIT', width: 5.625, height: 10 });
    pptx.layout = 'PORTRAIT';
  } else {
    // Default 16:9
    pptx.layout = 'LAYOUT_16x9';
  }

  // Iterate over slides
  for (const slide of slides) {
    const s = pptx.addSlide();

    // Add Image - make it fit nicely
    // Using 'contain' to ensure the whole slide is visible, centered.
    s.addImage({
      data: slide.imageUrl,
      x: 0,
      y: 0,
      w: '100%',
      h: '100%'
    });

    // Add Script to Notes
    if (slide.script) {
      s.addNotes(slide.script);
    }
  }

  // Generate and Download
  // The library handles the browser download automatically when writeFile is called in browser env
  await pptx.writeFile({ fileName: `Project-${Date.now()}.pptx` });
};
