import React from 'react';
import { Camera, TrendingUp } from 'lucide-react';
import { ResultCard } from './ResultCard';
import { ImageUpload } from './ImageUpload';
import { ListingData } from '../types';

interface SellingViewProps {
    analysisResult: ListingData | null;
    isAnalyzing: boolean;
    analyzedImages: string[];
    onAnalyze: (images: Array<{ base64: string, preview: string }>, purchasePrice?: string) => void;
    onReset: () => void;
}

export const SellingView: React.FC<SellingViewProps> = ({
    analysisResult,
    isAnalyzing,
    analyzedImages,
    onAnalyze,
    onReset
}) => {
    return (
        <div className="space-y-6">
            {!analysisResult && !isAnalyzing && (
                <div className="text-center space-y-2 mb-8 animate-fade-in-up">
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">
                        Vendez <span className="text-vinted">mieux</span>,<br />
                        gagnez <span className="text-vinted">plus</span>.
                    </h2>
                    <p className="text-slate-500 font-medium">
                        L'IA analyse vos photos et crée l'annonce parfaite en 1 clic.
                    </p>
                </div>
            )}

            {/* Upload Zone - Always visible */}
            <div className={`bg-white p-6 rounded-3xl shadow-xl shadow-indigo-100/50 border border-white/50 relative overflow-hidden transition-all duration-500 ${isAnalyzing ? 'scale-95 opacity-80' : 'hover:shadow-2xl hover:shadow-indigo-200/50'}`}>
                <ImageUpload onImagesSelected={onAnalyze} disabled={isAnalyzing} />

                {/* Scanning Animation Overlay */}
                {isAnalyzing && (
                    <div className="absolute inset-0 z-20 bg-slate-900/5 backdrop-blur-[2px] flex flex-col items-center justify-center">
                        <div className="relative w-64 h-80 rounded-xl overflow-hidden shadow-2xl mb-8 group">
                            {/* Stacked Photos Effect */}
                            {analyzedImages.length > 0 && (
                                <img src={analyzedImages[0]} alt="Analyzing" className="w-full h-full object-cover" />
                            )}

                            {/* Laser Scanner */}
                            <div className="absolute inset-x-0 h-1 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)] z-30 animate-scan-line"></div>

                            {/* Grid Overlay */}
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,0,0.1)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20"></div>
                        </div>

                        <div className="text-center space-y-3 z-30">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-black/80 text-white rounded-full text-sm font-bold animate-pulse">
                                <TrendingUp size={16} className="text-vinted" />
                                Analyse du marché en cours...
                            </div>
                            <p className="text-slate-600 font-medium text-sm">Détection de la marque, état et prix optimal</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Result Card */}
            {analysisResult && !isAnalyzing && (
                <div className="animate-fade-in-up space-y-6">
                    <div className="flex justify-center">
                        <button
                            onClick={onReset}
                            className="bg-white text-slate-600 px-6 py-2 rounded-full font-bold shadow-md hover:bg-slate-50 transition-all flex items-center gap-2 border border-slate-200"
                        >
                            <Camera size={18} />
                            Nouvelle Analyse
                        </button>
                    </div>
                    <ResultCard data={analysisResult} images={analyzedImages} />
                </div>
            )}
        </div>
    );
};
