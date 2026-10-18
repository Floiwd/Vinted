import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { Camera, TrendingUp, Wallet, User, History, Shirt, LogOut, Loader2 } from 'lucide-react';
// import { ResultCard } from './components/ResultCard'; // Moved to SellingView
// import { ImageUpload } from './components/ImageUpload'; // Moved to SellingView
import { HistoryDrawer } from './components/HistoryDrawer';
import { analyzeClothingImage, generateSourcingAdvice, analyzeBusinessStats } from './services/aiService';
import { StorageService } from './services/firebase';
import { ListingData, HistoryItem } from './types';
import { IOSInstallPrompt } from './components/IOSInstallPrompt';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginView } from './components/LoginView';
import { RegisterView } from './components/RegisterView';
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Lazy Load Views
const SellingView = lazy(() => import('./components/SellingView').then(module => ({ default: module.SellingView })));
const AccountingView = lazy(() => import('./components/AccountingView').then(module => ({ default: module.AccountingView })));
const SourcingView = lazy(() => import('./components/SourcingView').then(module => ({ default: module.SourcingView })));
const ProfileView = lazy(() => import('./components/ProfileView').then(module => ({ default: module.ProfileView })));

function AppContent() {
  const { currentUser, logout, loading } = useAuth();
  const [currentView, setCurrentView] = useState<'selling' | 'sourcing' | 'accounting' | 'profile'>('selling');

  // Auth Views State
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  const [analyzedImages, setAnalyzedImages] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<ListingData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Load History on Mount (if logged in)
  useEffect(() => {
    if (currentUser) {
      StorageService.getHistory(currentUser.uid).then(setHistory);
    }
  }, [currentUser]);

  const handleImageAnalysis = async (images: Array<{ base64: string, preview: string }>, purchasePrice?: string) => {
    setIsAnalyzing(true);
    setAnalyzedImages(images.map(i => i.preview)); // Store for animation/result
    setAnalysisResult(null);
    setCurrentView('selling');

    try {
      const base64Images = images.map(i => i.base64);
      const data = await analyzeClothingImage(base64Images);

      // Inject user price
      if (purchasePrice) {
        data.purchasePrice = purchasePrice;
      }

      setAnalysisResult(data);

      const newItem: HistoryItem = {
        id: crypto.randomUUID(), // Firestore générera son propre ID ou on garde celui-ci
        timestamp: Date.now(),
        thumbnail: images[0].preview,
        data: data
      };

      if (currentUser) {
        await StorageService.saveItem(currentUser.uid, newItem);
        // Reload history
        const updatedHistory = await StorageService.getHistory(currentUser.uid);
        setHistory(updatedHistory);
      }

    } catch (error) {
      console.error("Erreur d'analyse:", error);
      alert("Une erreur est survenue lors de l'analyse. Veuillez réessayer.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleHistorySelect = (item: HistoryItem) => {
    setAnalysisResult(item.data);
    setAnalyzedImages([item.thumbnail]);
    setIsHistoryOpen(false);
    setCurrentView('selling');
  };

  const handleDeleteHistory = async (id: string) => {
    if (currentUser) {
      await StorageService.deleteItem(currentUser.uid, id);
      const updatedHistory = await StorageService.getHistory(currentUser.uid);
      setHistory(updatedHistory);
    }
  };

  const renderContent = () => {
    switch (currentView) {
      case 'selling':
        return (
          <Suspense fallback={
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="animate-spin text-vinted" size={32} />
            </div>
          }>
            <SellingView
              analysisResult={analysisResult}
              isAnalyzing={isAnalyzing}
              analyzedImages={analyzedImages}
              onAnalyze={handleImageAnalysis}
              onReset={() => {
                setAnalysisResult(null);
                setAnalyzedImages([]);
              }}
            />
          </Suspense>
        );
      case 'sourcing':
        return (
          <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-vinted" size={32} /></div>}>
            <SourcingView />
          </Suspense>
        );
      case 'accounting':
        return (
          <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-vinted" size={32} /></div>}>
            <AccountingView />
          </Suspense>
        );
      case 'profile':
        return (
          <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-vinted" size={32} /></div>}>
            <ProfileView />
          </Suspense>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-vinted/20 rounded-full flex items-center justify-center">
            <TrendingUp className="text-vinted animate-spin" size={32} />
          </div>
          <p className="text-slate-400 font-medium text-sm">Chargement de votre espace...</p>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    if (authView === 'register') {
      return <RegisterView onNavigateToLogin={() => setAuthView('login')} />;
    }
    return <LoginView onNavigateToRegister={() => setAuthView('register')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-100 to-fuchsia-50 font-sans text-slate-900 pb-24 md:pb-0 relative">
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 pointer-events-none z-0 mix-blend-multiply"></div>
      <div className="relative z-10 h-full">

        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-white/20 px-4 py-3 flex items-center justify-between md:px-8 md:py-4 relative shadow-sm">
          {/* LOGO (Left) */}
          <div
            className="flex items-center gap-2 shrink-0 cursor-pointer z-10"
            onClick={() => setCurrentView('selling')}
          >
            <div className="bg-gradient-to-br from-vinted to-vinted-dark p-2 rounded-xl text-white shadow-lg shadow-vinted/20">
              <Shirt size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 hidden sm:block">
              Vinted<span className="text-vinted">Assistant</span>
            </h1>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:hidden">
              V<span className="text-vinted">A</span>
            </h1>
          </div>

          {/* NAVIGATION (Center - Absolute) */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-1 bg-white/90 backdrop-blur border border-white/50 p-1.5 rounded-full shadow-lg shadow-indigo-100/50 z-10">
            <DesktopNavButton
              active={currentView === 'selling'}
              onClick={() => setCurrentView('selling')}
              icon={<Camera size={16} />}
              label="Scan"
            />
            <DesktopNavButton
              active={currentView === 'sourcing'}
              onClick={() => setCurrentView('sourcing')}
              icon={<TrendingUp size={16} />}
              label="Sourcing"
            />
            <DesktopNavButton
              active={currentView === 'accounting'}
              onClick={() => setCurrentView('accounting')}
              icon={<Wallet size={16} />}
              label="Compta"
            />
            <DesktopNavButton
              active={currentView === 'profile'}
              onClick={() => setCurrentView('profile')}
              icon={<User size={16} />}
              label="Profil"
            />
          </div>

          {/* RIGHT ACTIONS (History) */}
          <div className="flex items-center gap-2 z-10">
            {currentView === 'selling' && (
              <button
                onClick={() => setIsHistoryOpen(true)}
                className="relative p-2 text-slate-500 hover:bg-white hover:text-vinted rounded-full transition-all active:scale-95"
                title="Historique"
              >
                <History size={24} />
                {history.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-4 md:px-8 md:py-6">
          {renderContent()}
        </main>

        {/* Navigation Mobile (Bottom Bar) */}
        <nav className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-lg border-t border-slate-200 px-6 py-3 flex justify-between items-center z-30 md:hidden pb-safe">
          <NavButton
            active={currentView === 'selling'}
            onClick={() => setCurrentView('selling')}
            icon={<Camera size={24} />}
            label="Scan"
          />
          <NavButton
            active={currentView === 'sourcing'}
            onClick={() => setCurrentView('sourcing')}
            icon={<TrendingUp size={24} />}
            label="Sourcing"
          />
          <NavButton
            active={currentView === 'accounting'}
            onClick={() => setCurrentView('accounting')}
            icon={<Wallet size={24} />}
            label="Compta"
          />
          <NavButton
            active={currentView === 'profile'}
            onClick={() => setCurrentView('profile')}
            icon={<User size={24} />}
            label="Profil"
          />
        </nav>

        {/* History Side Drawer */}
        <HistoryDrawer
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          history={history}
          onSelect={handleHistorySelect}
          onDelete={handleDeleteHistory}
        />

        <IOSInstallPrompt />
      </div>
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 transition-colors duration-200 ${active ? 'text-vinted' : 'text-slate-400 hover:text-slate-600'}`}
  >
    <div className={`p-1 rounded-xl transition-all ${active ? 'bg-vinted/10 -translate-y-1' : ''}`}>
      {icon}
    </div>
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

const DesktopNavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-bold ${active
      ? 'bg-vinted text-white shadow-md transform scale-105'
      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
      }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
        <Analytics />
        <SpeedInsights />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;