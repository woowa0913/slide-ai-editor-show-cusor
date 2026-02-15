
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Set the worker source to the same version as the library
// We explicitly use the ESM build worker for compatibility
GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const fileData = await file.arrayBuffer();
  
  // Load the PDF document
  const pdf = await getDocument({ data: fileData }).promise;
  const numPages = pdf.numPages;
  const imageUrls: string[] = [];

  // Iterate through all pages
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    
    // Set scale to 3.0 for higher quality (optimized for 1080p video)
    const viewport = page.getViewport({ scale: 3.0 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) continue;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    
    // Convert to JPEG base64 string
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    imageUrls.push(base64);
  }

  return imageUrls;
};
