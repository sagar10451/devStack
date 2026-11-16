// Loaded only by test-intro.mjs. Static imports let Vite use the same React
// and Router instances as the application. App writes are intercepted there.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Editor } from 'tldraw';
import LessonCanvas from '../src/canvas/LessonCanvas';
import type { LessonCanvasData } from '../src/canvas/types';
import { PresentationProvider } from '../src/data/presentationContext';

export function mountLesson(lesson: LessonCanvasData) {
  const original = Editor.prototype.createShapes;
  Editor.prototype.createShapes = function (...args: Parameters<Editor['createShapes']>) {
    (window as unknown as { __introEditor: Editor }).__introEditor = this;
    return original.apply(this, args);
  };
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = document.getElementById('root'); if (root) root.style.display = 'none';
  createRoot(host).render(<BrowserRouter><PresentationProvider><LessonCanvas siteId="intro-test" topicSlug="fixture" subtopicSlug="fixture" topicTitle="Fixture" subtopicTitle="The Rise of Nationalism in Europe" watermark="" backPath="/" initialData={lesson} /></PresentationProvider></BrowserRouter>);
}
