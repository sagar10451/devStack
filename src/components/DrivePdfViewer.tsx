/**
 * DrivePdfViewer — renders a Google Drive PDF with fit-to-width.
 * Uses react-pdf (PDF.js) for full control over rendering.
 * Downloads PDF from Google Drive public URL, renders all pages.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface DrivePdfViewerProps {
  driveFileId: string;
}

export default function DrivePdfViewer({ driveFileId }: DrivePdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Google Drive direct download URL for public files
  const pdfUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}`;

  // Track container width for fit-to-width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => setContainerWidth(el.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setError('Failed to load PDF. The file may not be publicly shared.');
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden"
      style={{ background: '#0B0D0F' }}
    >
      {error ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : (
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center h-[50vh]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-500 text-sm">Loading notes...</span>
              </div>
            </div>
          }
        >
          <div className="flex flex-col items-center gap-2 py-4">
            {Array.from({ length: numPages }, (_, i) => (
              <Page
                key={`page-${i + 1}`}
                pageNumber={i + 1}
                width={containerWidth > 0 ? containerWidth - 16 : undefined}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={null}
              />
            ))}
          </div>
        </Document>
      )}
    </div>
  );
}
