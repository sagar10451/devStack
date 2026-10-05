import { useEffect, useRef } from 'react';

interface Stroke {
  points: { x: number; y: number }[];
  timestamp: number;
}

interface LaserPointerProps {
  onStrokeComplete?: (path: { x: number; y: number; t: number }[]) => void;
}

export default function LaserPointer({ onStrokeComplete }: LaserPointerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<{ x: number; y: number; t: number }[] | null>(null);
  const strokeStartTimeRef = useRef<number>(0);
  const isDrawingRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  onStrokeCompleteRef.current = onStrokeComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      isDrawingRef.current = true;
      strokeStartTimeRef.current = performance.now();
      currentStrokeRef.current = [{ x: e.clientX - rect.left, y: e.clientY - rect.top, t: 0 }];
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const t = performance.now() - strokeStartTimeRef.current;
      currentStrokeRef.current.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, t });
    };

    const handleMouseUp = () => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      isDrawingRef.current = false;
      if (currentStrokeRef.current.length > 1) {
        const completedPath = [...currentStrokeRef.current];
        strokesRef.current.push({
          points: completedPath.map(p => ({ x: p.x, y: p.y })),
          timestamp: Date.now(),
        });
        // Notify parent of completed stroke with timestamps
        if (onStrokeCompleteRef.current) {
          onStrokeCompleteRef.current(completedPath);
        }
      }
      currentStrokeRef.current = null;
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    // Animation loop
    const FADE_DURATION = 1200; // ms

    function draw() {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      const now = Date.now();

      // Remove fully faded strokes
      strokesRef.current = strokesRef.current.filter(
        s => now - s.timestamp < FADE_DURATION
      );

      // Draw fading strokes
      for (const stroke of strokesRef.current) {
        const age = now - stroke.timestamp;
        const opacity = Math.max(0, 1 - age / FADE_DURATION);
        drawStroke(ctx, stroke.points, opacity);
      }

      // Draw current active stroke
      if (currentStrokeRef.current && currentStrokeRef.current.length > 1) {
        drawStroke(ctx, currentStrokeRef.current, 1);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[99998] pointer-events-auto"
    />
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], opacity: number) {
  if (points.length < 2) return;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Outer glow — bright red
  ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }
  ctx.stroke();

  // Bright white-red core
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255, 100, 100, ${0.7 * opacity})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }
  ctx.stroke();

  ctx.restore();
}
