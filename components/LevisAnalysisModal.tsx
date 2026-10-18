import React, { useState, useEffect } from 'react';
import { X, Loader2, Copy, Check, TrendingUp, Target, Search, Sparkles, Gauge, AlertCircle, ExternalLink } from 'lucide-react';
import { getLevisAnalysis, LevisModel } from '../services/aiService';

interface LevisAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LevisAnalysisModal: React.FC<LevisAnalysisModalProps> = ({ isOpen, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [models, setModels] = useState<LevisModel[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [copiedQuery, setCopiedQuery] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen && models.length === 0 && !loading) {
            fetchAnalysis();
        }
    }, [isOpen]);

    const fetchAnalysis = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getLevisAnalysis();
            setModels(result);
        } catch (err: any) {
            setError(err.message || "Erreur lors de l'analyse");
        } finally {
            setLoading(false);
        }
    };

    const copyQuery = (query: string, index: number) => {
        navigator.clipboard.writeText(query);
        setCopiedQuery(index);
        setTimeout(() => setCopiedQuery(null), 2000);
    };

    const openVintedSearch = (query: string) => {
        window.open(`https://www.vinted.fr/catalog?search_text=${encodeURIComponent(query)}`, '_blank');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div
                className="absolute inset-2 bg-gradient-to-br from-slate-50 to-white rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-slide-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header - Compact */}
                <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 p-4 sm:p-6 text-white relative overflow-hidden shrink-0">
                    <div className="absolute -right-20 -top-20 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>

                    <div className="relative z-10 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm hidden sm:block">
                                <TrendingUp size={24} />
                            </div>
                            <div>
                                <h2 className="text-lg sm:text-xl font-bold">Guide Levi's Resell</h2>
                                <p className="text-white/70 text-xs hidden sm:block">Analyse IA des modèles les plus rentables</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content - Scrollable Grid */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-purple-200 rounded-full"></div>
                                <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                            </div>
                            <p className="text-slate-500 text-sm mt-4">Analyse des modèles Levi's...</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 border border-red-100">
                            <AlertCircle size={20} />
                            <div>
                                <p className="text-sm font-medium">{error}</p>
                                <button onClick={fetchAnalysis} className="text-xs underline mt-1 hover:text-red-700">
                                    Réessayer
                                </button>
                            </div>
                        </div>
                    )}

                    {!loading && !error && models.length > 0 && (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {models.map((model, index) => (
                                <div
                                    key={index}
                                    className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-lg hover:shadow-xl hover:border-purple-200 transition-all overflow-hidden group"
                                >
                                    {/* Card Header */}
                                    <div className="p-4 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
                                                LEVI'S
                                            </span>
                                            <div className="flex gap-1">
                                                {model.liquidity && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5
                                                        ${model.liquidity?.includes('Rapide') ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        <Gauge size={8} /> {model.liquidity}
                                                    </span>
                                                )}
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                                                    ${model.difficulty === 'Facile' ? 'bg-emerald-100 text-emerald-600' :
                                                        model.difficulty === 'Moyen' ? 'bg-amber-100 text-amber-600' :
                                                            'bg-red-100 text-red-600'}`}>
                                                    {model.difficulty}
                                                </span>
                                            </div>
                                        </div>
                                        <h4 className="font-bold text-slate-800 text-base sm:text-lg">{model.model}</h4>
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{model.description}</p>
                                    </div>

                                    {/* Price Stats */}
                                    <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/50">
                                        <div className="py-3 px-2 text-center">
                                            <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">Achat</span>
                                            <span className="font-black text-slate-700 text-sm">{model.buyPrice}€</span>
                                        </div>
                                        <div className="py-3 px-2 text-center">
                                            <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">Revente</span>
                                            <span className="font-black text-slate-700 text-sm">{model.sellPrice}€</span>
                                        </div>
                                        <div className="py-3 px-2 text-center bg-emerald-50/80">
                                            <span className="block text-[9px] text-emerald-600 uppercase font-bold mb-0.5">Profit</span>
                                            <span className="font-black text-emerald-500 text-sm">+{model.profit}€</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="p-3 sm:p-4 space-y-3">
                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={() => openVintedSearch(model.searchQuery)}
                                                className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-slate-900 text-white rounded-xl hover:bg-indigo-900 transition-colors shadow-sm font-medium text-sm"
                                            >
                                                <Search size={16} />
                                                <span className="truncate">Chasser "{model.searchQuery}"</span>
                                                <ExternalLink size={14} className="opacity-50 ml-1" />
                                            </button>

                                            <button
                                                onClick={() => copyQuery(model.searchQuery, index)}
                                                className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl transition-all border font-medium text-sm
                                                    ${copiedQuery === index
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                            >
                                                {copiedQuery === index ? <Check size={16} /> : <Copy size={16} />}
                                                <span>{copiedQuery === index ? 'Copié !' : 'Copier la recherche'}</span>
                                            </button>
                                        </div>

                                        {/* Tip - Expandable */}
                                        {model.tips && (
                                            <div className="group/tip">
                                                <details className="text-xs text-slate-700 bg-amber-50/50 p-3 rounded-xl border border-amber-100 open:bg-amber-50 transition-colors">
                                                    <summary className="flex items-center gap-2 font-bold text-amber-700 cursor-pointer list-none select-none">
                                                        <Sparkles size={14} className="shrink-0" />
                                                        <span>Expert Tip</span>
                                                        <span className="ml-auto text-[10px] uppercase tracking-wider opacity-60 group-open/tip:hidden">Voir +</span>
                                                    </summary>
                                                    <p className="mt-2 leading-relaxed opacity-90">
                                                        {model.tips}
                                                    </p>
                                                </details>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 sm:p-4 border-t border-slate-200 bg-white shrink-0">
                    <button
                        onClick={fetchAnalysis}
                        disabled={loading}
                        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition-all active:scale-[0.98]"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Target size={18} />}
                        {loading ? 'Analyse...' : 'Actualiser'}
                    </button>
                </div>
            </div>
        </div>
    );
};
