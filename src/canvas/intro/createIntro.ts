import { createShapeId, getIndexBelow, PageRecordType, type Editor } from 'tldraw';
import type { AnimationStep } from '../types';
import type { IntroShape } from './IntroShape';
import type { SubTopicLabel } from '../types';

export function introStepsForPage(editor: Editor, pageId: string): AnimationStep[] {
  const shapes = [...editor.getPageShapeIds(pageId as any)].map(id => editor.getShape(id)).filter(shape => shape?.type === 'intro-scene') as IntroShape[];
  const logo = shapes.find(shape => shape.props.role === 'logo'), chapter = shapes.find(shape => shape.props.role === 'chapter');
  return [
    ...(logo ? [
      { id: `intro-logo-${logo.id}`, shapeIds: [logo.id], animation: 'none' as const, action: 'enter' as const, duration: 0, label: 'Channel logo', pageId, cameraPosition: { x: 0, y: 0, z: 1 } },
      { id: logo.props.effectStepId, shapeIds: [logo.id], animation: 'none' as const, action: 'none' as const, duration: 2200, label: '⚡ Channel electricity', pageId, introEffect: 'electricity' as const },
    ] : []),
    ...(chapter ? [{ id: chapter.props.effectStepId, shapeIds: [chapter.id], animation: 'none' as const, action: 'none' as const, duration: 800, label: 'Chapter · Free S', pageId, introEffect: 'chapter' as const }] : []),
  ];
}

export function rebaseIntroLabels(labels: SubTopicLabel[], oldPages: string[], pages: string[], oldSteps: AnimationStep[], steps: AnimationStep[]) {
  const pageIndex = (index: number) => Math.max(0, pages.indexOf(oldPages[index]));
  const stepIndex = (index: number) => Math.max(0, steps.findIndex(step => step.id === oldSteps[index]?.id));
  return labels.map(label => ({ ...label, startStep: stepIndex(label.startStep), endStep: stepIndex(label.endStep),
    ...(label.startPage !== undefined ? { startPage: pageIndex(label.startPage) } : {}),
    ...(label.endPage !== undefined ? { endPage: pageIndex(label.endPage) } : {}),
  }));
}

export function createIntro(editor: Editor, steps: AnimationStep[], title: string, beforeCreate?: (pageId: string) => void) {
  const pages = editor.getPages();
  const existing = pages.find(page => page.meta.introPage === true);
  if (existing) { editor.setCurrentPage(existing.id); return { pageId: existing.id, created: false, insertedPage: false, steps }; }
  const first = pages[0];
  const reuse = !!first && editor.getPageShapeIds(first.id).size === 0 && !steps.some(step => !step.pageId || step.pageId === first.id);
  const pageId = reuse ? first.id : PageRecordType.createId();
  const backgroundId = createShapeId(), logoId = createShapeId(), titleId = createShapeId();
  const logoStep = `intro-logo-${logoId}`, electricStep = `intro-electric-${logoId}`, titleStep = `intro-title-${titleId}`;
  const introSteps: AnimationStep[] = [
    { id: logoStep, shapeIds: [logoId], animation: 'none', action: 'enter', duration: 0, label: 'Channel logo', pageId, cameraPosition: { x: 0, y: 0, z: 1 } },
    { id: electricStep, shapeIds: [logoId], animation: 'none', action: 'none', duration: 2200, label: '⚡ Channel electricity', pageId, introEffect: 'electricity' },
    { id: titleStep, shapeIds: [titleId], animation: 'none', action: 'none', duration: 800, label: 'Chapter · Free S', pageId, introEffect: 'chapter' },
  ];
  beforeCreate?.(pageId);
  editor.markHistoryStoppingPoint('Create intro');
  editor.run(() => {
    if (reuse) editor.updatePage({ id: pageId, name: 'Intro', meta: { ...first.meta, introPage: true } });
    else editor.createPage({ id: pageId, name: 'Intro', index: getIndexBelow(first?.index), meta: { introPage: true } });
    editor.setCurrentPage(pageId);
    editor.createShapes<IntroShape>([
      { id: backgroundId, type: 'intro-scene', parentId: pageId, x: 0, y: 0, isLocked: true, props: { w: 1600, h: 900, role: 'background', text: '', effectStepId: '' }, meta: { isIntroDecoration: true } },
      { id: logoId, type: 'intro-scene', parentId: pageId, x: 100, y: 25, isLocked: true, props: { w: 1400, h: 1400 * 195 / 1140, role: 'logo', text: '', effectStepId: electricStep } },
      { id: titleId, type: 'intro-scene', parentId: pageId, x: 200, y: 295, props: { w: 1200, h: 150, role: 'chapter', text: title || 'Chapter name', effectStepId: titleStep } },
    ]);
  });
  const previous = steps.map(step => ({ ...step, pageId: step.pageId || first.id,
    ...(step.titlePageRange && typeof step.titlePageRange === 'object' && !reuse ? { titlePageRange: { from: step.titlePageRange.from + 1, to: step.titlePageRange.to + 1 } } : {}),
  }));
  return { pageId, created: true, insertedPage: !reuse, steps: [...introSteps, ...previous] };
}
