import { useEffect, useState } from 'react';
import type { Editor } from 'tldraw';
import type { IdleAnimation, ShapeAnimationConfig } from './types';
import { previewIdleAnimation } from './animationEngine';

interface AnimationBarProps {
  editor: Editor | null;
  shapeAnimations: Record<string, ShapeAnimationConfig>;
  onShapeAnimationsChange: (anims: Record<string, ShapeAnimationConfig>) => void;
}

const idleOptions: { value: IdleAnimation; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'float', label: 'Float' },
  { value: 'shake', label: 'Shake' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'breathe', label: 'Breathe' },
  { value: 'wiggle', label: 'Wiggle' },
  { value: 'sway', label: 'Sway' },
];

export default function AnimationBar({ editor, shapeAnimations, onShapeAnimationsChange }: AnimationBarProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionChange = () => {
      const ids = editor.getSelectedShapeIds();
      if (ids.length === 1) {
        setSelectedId(ids[0] as string);
      } else {
        setSelectedId(null);
      }
    };

    handleSelectionChange();
    const unsub = editor.store.listen(handleSelectionChange, { scope: 'session' });
    return () => unsub();
  }, [editor]);

  if (!selectedId || !editor) {
    return (
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="text-xs text-gray-400">Select a shape to set idle animation</span>
      </div>
    );
  }

  const config = shapeAnimations[selectedId] || { entrance: 'appear', idle: 'none' };

  const handleIdleChange = (value: IdleAnimation) => {
    const newAnims = { ...shapeAnimations };
    newAnims[selectedId] = { ...config, idle: value };
    onShapeAnimationsChange(newAnims);
    previewIdleAnimation(selectedId, value);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="text-xs font-medium text-slate-400">Idle</span>
      <select
        value={config.idle}
        onChange={(e) => handleIdleChange(e.target.value as IdleAnimation)}
        className="text-xs border border-[#2a2a4e] rounded-md px-2 py-1 bg-[#12121f] text-slate-300"
      >
        {idleOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
