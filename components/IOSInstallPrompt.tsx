import React, { useState, useEffect } from 'react';
import { Share, X, PlusSquare } from 'lucide-react';

export const IOSInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Detects if device is on iOS 
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    // Detects if device is in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    // Show prompt only on iOS and if not installed
    if (isIOS && !isStandalone) {
      setShowPrompt(true);
    }
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-28 left-4 right-4 z-[60] animate-fade-in-up">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-4 border border-slate-200 relative">
        <button 
          onClick={() => setShowPrompt(false)}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 p-1"
        >
          <X size={16} />
        </button>

        <div className="flex gap-4 pr-6">
          <div className="w-12 h-12 bg-vinted rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm">
            <PlusSquare size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Installer l'application</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Pour installer VintedAssistant sur votre iPhone :
            </p>
            <div className="mt-3 space-y-2 text-xs font-medium text-slate-700">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 bg-slate-100 rounded text-vinted">1</span>
                <span>Appuyez sur <Share size={14} className="inline mx-1 text-blue-500" /> (Partager) en bas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 bg-slate-100 rounded text-vinted">2</span>
                <span>Sélectionnez "Sur l'écran d'accueil"</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Triangle pointer specific to Safari bottom bar usually */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white transform rotate-45 border-b border-r border-slate-200"></div>
      </div>
    </div>
  );
};