import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  title: string;
}

export default function PdfViewer({ url, title }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState(false);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  if (error) {
    return (
      <div className="w-full h-[calc(100vh-78px)] flex items-center justify-center bg-[#0a0a14]">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-300">No notes available yet</p>
          <p className="text-sm text-slate-500 mt-1">PDF for "{title}" has not been uploaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-78px)] overflow-y-auto bg-[#0a0a14]">
      <div className="max-w-4xl mx-auto py-6">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={() => setError(true)}
          loading={
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          {numPages && Array.from(new Array(numPages), (_, index) => (
            <div key={`page_${index + 1}`} className="mb-4 shadow-lg rounded-lg overflow-hidden">
              <Page
                pageNumber={index + 1}
                width={800}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
