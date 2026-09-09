import { createContext, useContext, useState, useCallback, useEffect } from 'react';

type PresentationTool = 'pointer' | 'laser';

interface PresentationContextValue {
  isPresenting: boolean;
  togglePresentation: () => void;
  presentationTool: PresentationTool;
  setPresentationTool: (tool: PresentationTool) => void;
}

const PresentationContext = createContext<PresentationContextValue>({
  isPresenting: false,
  togglePresentation: () => {},
  presentationTool: 'pointer',
  setPresentationTool: () => {},
});

export function PresentationProvider({ children }: { children: React.ReactNode }) {
  const [isPresenting, setIsPresenting] = useState(false);
  const [presentationTool, setPresentationTool] = useState<PresentationTool>('pointer');

  const togglePresentation = useCallback(() => {
    if (!isPresenting) {
      document.documentElement.requestFullscreen().then(() => {
        setIsPresenting(true);
        setPresentationTool('pointer');
      }).catch(() => {
        setIsPresenting(true);
        setPresentationTool('pointer');
      });
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      setIsPresenting(false);
    }
  }, [isPresenting]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isPresenting) {
        setIsPresenting(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isPresenting]);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove('presenting-mode', 'laser-active');
    if (isPresenting) {
      el.classList.add('presenting-mode');
      if (presentationTool === 'laser') {
        el.classList.add('laser-active');
      }
    }
    return () => el.classList.remove('presenting-mode', 'laser-active');
  }, [isPresenting, presentationTool]);

  return (
    <PresentationContext.Provider value={{ isPresenting, togglePresentation, presentationTool, setPresentationTool }}>
      {children}
    </PresentationContext.Provider>
  );
}

export function usePresentation() {
  return useContext(PresentationContext);
}
