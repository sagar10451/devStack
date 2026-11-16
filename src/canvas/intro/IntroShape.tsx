import { createContext, useContext, useId } from 'react';
import { ShapeUtil, HTMLContainer, Rectangle2d, T, resizeBox, type TLShape, type RecordProps, type TLResizeInfo } from 'tldraw';
import { INTRO_EDITING, INTRO_LOGO_URL, INTRO_ELECTRIC_SECONDS, logoSheenStateAt, type IntroPlayback } from './playback';
import { swipeProgressAt } from '../swipeReveal';
import wiring from './logoWiring.json';

export const IntroPlaybackContext = createContext<IntroPlayback>(INTRO_EDITING);
declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    'intro-scene': { w: number; h: number; role: string; text: string; effectStepId: string };
  }
}
export type IntroShape = TLShape<'intro-scene'>;

export function IntroArtwork({ shape, editing, onText }: { shape: IntroShape; editing: boolean; onText: (text: string) => void }) {
  const playback = useContext(IntroPlaybackContext);
  const glowId = useId().replace(/:/g, '');
  const { w, h, role, text, effectStepId } = shape.props;
  const elapsed = playback.elapsed[effectStepId] ?? -1;
  const sheen = logoSheenStateAt(elapsed);
  if (role === 'background') return <div style={{ width: w, height: h, background: '#fff' }} />;
  if (role === 'logo') return <div data-intro-logo data-intro-elapsed={elapsed} data-intro-locked={playback.locked} style={{ width: w, height: h, position: 'relative', overflow: 'hidden', background: '#fff', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 4% 100%, 4% 60%, 0 60%)' }}>
    <img src={INTRO_LOGO_URL} alt="Doubt का THE END!" draggable={false} style={{ position: 'absolute', width: w * 1672 / 1140, maxWidth: 'none', height: 'auto', left: -250 * w / 1140, top: 0, pointerEvents: 'none' }} />
    {playback.locked && elapsed > 0 && elapsed < INTRO_ELECTRIC_SECONDS && <svg data-intro-electricity viewBox="250 0 1140 195" width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <filter id={`${glowId}-bloom`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.4" /></filter>
        <clipPath id={`${glowId}-letters`} clipPathUnits="userSpaceOnUse">
          <path d={wiring.map(wire => wire.d).join(' ')} fillRule="evenodd" clipRule="evenodd" />
        </clipPath>
        <linearGradient id={`${glowId}-sheen`} gradientUnits="userSpaceOnUse" x1={sheen.center - 105} y1="195" x2={sheen.center + 105} y2="0">
          <stop offset="0" stopColor="#b18032" stopOpacity="0" />
          <stop offset=".3" stopColor="#c89c51" stopOpacity=".22" />
          <stop offset=".43" stopColor="#f3dba5" stopOpacity=".85" />
          <stop offset=".5" stopColor="#fffdf2" />
          <stop offset=".57" stopColor="#f8e8c7" stopOpacity=".9" />
          <stop offset=".73" stopColor="#cda65f" stopOpacity=".28" />
          <stop offset="1" stopColor="#b18032" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${glowId}-flare`}><stop stopColor="#fffef1" /><stop offset=".2" stopColor="#fff2c9" stopOpacity=".9" /><stop offset=".55" stopColor="#e5bc72" stopOpacity=".3" /><stop offset="1" stopColor="#d7ae65" stopOpacity="0" /></radialGradient>
      </defs>
      <g clipPath={`url(#${glowId}-letters)`} opacity={sheen.opacity}>
        <rect x="250" width="1140" height="195" fill={`url(#${glowId}-sheen)`} />
      </g>
      {[{ x: 445, y: 62, opacity: sheen.ignition, radius: 14 }, { x: 1324, y: 87, opacity: sheen.glint, radius: 20 }].map((light, index) => <g key={index} opacity={light.opacity}>
        <circle cx={light.x} cy={light.y} r={light.radius} fill={`url(#${glowId}-flare)`} />
        <g filter={`url(#${glowId}-bloom)`} stroke="#fff5d7" strokeLinecap="round"><path d={`M${light.x - light.radius} ${light.y} h${light.radius * 2}`} strokeWidth="1.2" /><path d={`M${light.x} ${light.y - light.radius * .45} v${light.radius * .9}`} strokeWidth="1" /></g>
        <circle cx={light.x} cy={light.y} r="1.4" fill="#fffef4" />
      </g>)}
    </svg>}
  </div>;

  const progress = playback.locked ? swipeProgressAt(elapsed) : 0;
  const fontSize = Math.max(20, Math.min(50, Math.sqrt((w - 90) * (h - 40) / Math.max(1, text.length) / .7)));
  const titleStyle = { color: '#111126', textAlign: 'center' as const, fontSize, fontWeight: 700, fontStyle: 'italic', fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive', lineHeight: 1.18 };
  return <div data-intro-chapter style={{ width: w, height: h, position: 'relative', boxSizing: 'border-box' }}>
    <svg aria-hidden="true" viewBox="0 0 1200 150" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs><linearGradient id={`${glowId}-lavender`} x2="0.8" y2="1"><stop stopColor="#e6d6ff" /><stop offset=".5" stopColor="#d7bdf5" /><stop offset="1" stopColor="#eee2ff" /></linearGradient></defs>
      <path d="M42 12 Q105 0 225 10 T570 8 T920 9 Q1135 0 1172 23 Q1203 49 1183 85 Q1202 127 1158 137 Q981 150 815 139 T450 142 T85 138 Q7 145 16 101 Q-5 57 21 33 Z" fill={`url(#${glowId}-lavender)`} opacity=".85" />
      <path d="M34 126 Q210 148 390 136 T795 138 T1165 127" fill="none" stroke="#9364c9" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 43 L-16 31 M3 72 L-23 70 M8 99 L-13 113 M1194 43 L1215 31 M1197 72 L1223 70 M1192 99 L1213 113" fill="none" stroke="#ff287b" strokeWidth="5" strokeLinecap="round" />
    </svg>
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', padding: '14px 34px', position: 'relative' }}>
      {editing && !playback.locked ? <textarea aria-label="Intro chapter name" autoFocus value={text} onChange={event => onText(event.target.value)} onPointerDown={event => event.stopPropagation()} style={{ ...titleStyle, width: '100%', height: '100%', resize: 'none', background: 'transparent', border: 0, outline: 0 }} /> : <div style={{ ...titleStyle, position: 'relative', maxWidth: '100%', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
        <svg data-intro-highlight data-progress={progress} aria-hidden="true" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: '-5% -1%', width: '102%', height: '110%', pointerEvents: 'none', clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}>
          <path d="M12 14 Q120 5 255 13 T540 10 T810 14 Q940 5 985 17 L990 76 Q940 97 800 86 T520 90 T250 88 Q80 99 9 83 Z" fill="#ffe735" opacity=".9" />
        </svg>
        <span style={{ position: 'relative' }}>{text || 'Chapter name'}</span>
      </div>}
    </div>
  </div>;
}

export class IntroShapeUtil extends ShapeUtil<IntroShape> {
  static override type = 'intro-scene' as const;
  static override props: RecordProps<IntroShape> = { w: T.number, h: T.number, role: T.string, text: T.string, effectStepId: T.string };
  getDefaultProps(): IntroShape['props'] { return { w: 1100, h: 150, role: 'chapter', text: 'Chapter name', effectStepId: '' }; }
  getGeometry(shape: IntroShape) { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }); }
  override canEdit(shape: IntroShape) { return shape.props.role === 'chapter'; }
  override canResize(shape: IntroShape) { return shape.props.role === 'chapter'; }
  override onResize(shape: IntroShape, info: TLResizeInfo<IntroShape>) { return resizeBox(shape, info); }
  component(shape: IntroShape) {
    return <HTMLContainer style={{ overflow: 'visible', pointerEvents: this.editor.getEditingShapeId() === shape.id ? 'all' : 'auto' }}><IntroArtwork shape={shape} editing={this.editor.getEditingShapeId() === shape.id} onText={text => this.editor.updateShape<IntroShape>({ id: shape.id, type: 'intro-scene', props: { text } })} /></HTMLContainer>;
  }
  getIndicatorPath(shape: IntroShape) { const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path; }
}
