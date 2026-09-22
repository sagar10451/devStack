import { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { PortalProvider, usePortal } from './data/portalContext';
import { PresentationProvider } from './data/presentationContext';
import Header from './components/Header';
import PortalPage from './pages/PortalPage';
import { BookOpen, Code2 } from 'lucide-react';

function PortalPicker() {
  return (
    <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">Choose a Portal</h1>
        <p className="text-gray-500 mb-8">Select which content you want to explore</p>
        <div className="flex gap-8">
          <Link
            to="/devStack"
            className="group block relative bg-gradient-to-b from-[#141428] to-[#0e0e1c] rounded-2xl p-8 border border-blue-500/15 hover:border-blue-400/40 hover:-translate-y-2 transition-all duration-300 w-64 overflow-hidden"
            style={{ boxShadow: '0 0 0 1px rgba(59,130,246,0.05), 0 4px 20px rgba(0,0,0,0.3)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(59,130,246,0.15), 0 0 60px rgba(59,130,246,0.06), 0 8px 30px rgba(0,0,0,0.4)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 1px rgba(59,130,246,0.05), 0 4px 20px rgba(0,0,0,0.3)'; }}
          >
            {/* Subtle top highlight */}
            <div className="absolute top-0 left-[20%] right-[20%] h-[1px] bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-5 mx-auto group-hover:scale-110 transition-transform" style={{ boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}>
              <Code2 className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-100">dev<span className="text-blue-400">Stack</span></h2>
            <p className="text-sm text-slate-500 mt-1.5">IT / CS Topics</p>
          </Link>
          <Link
            to="/chapterBreakdown"
            className="group block relative bg-gradient-to-b from-[#121428] to-[#0e0e1c] rounded-2xl p-8 border border-emerald-500/15 hover:border-emerald-400/40 hover:-translate-y-2 transition-all duration-300 w-64 overflow-hidden"
            style={{ boxShadow: '0 0 0 1px rgba(16,185,129,0.05), 0 4px 20px rgba(0,0,0,0.3)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(16,185,129,0.15), 0 0 60px rgba(16,185,129,0.06), 0 8px 30px rgba(0,0,0,0.4)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 1px rgba(16,185,129,0.05), 0 4px 20px rgba(0,0,0,0.3)'; }}
          >
            <div className="absolute top-0 left-[20%] right-[20%] h-[1px] bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mb-5 mx-auto group-hover:scale-110 transition-transform" style={{ boxShadow: '0 0 20px rgba(16,185,129,0.3)' }}>
              <BookOpen className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-100">Chapter<span className="text-emerald-400">Breakdown</span></h2>
            <p className="text-sm text-slate-500 mt-1.5">School — Class 10, 12</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const { site } = usePortal();

  // No portal selected — show picker
  if (!site) {
    return <PortalPicker />;
  }

  return (
    <div className={`min-h-screen bg-[#0a0a12] pt-[78px]`}>
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <Routes>
        <Route path="/*" element={<PortalPage searchQuery={searchQuery} onSearchChange={setSearchQuery} />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <PortalProvider>
      <PresentationProvider>
        <AppContent />
      </PresentationProvider>
    </PortalProvider>
  );
}
