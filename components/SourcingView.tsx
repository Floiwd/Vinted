import React, { useState } from 'react';
import { Euro, Search, TrendingUp, AlertCircle, Target, Sparkles, Loader2, Gauge, Copy, Check, BookOpen, ExternalLink, Menu, ChevronDown, X } from 'lucide-react';
import { generateSourcingAdvice } from '../services/aiService';
import { SourcingOpportunity } from '../types';
import { LevisAnalysisModal } from './LevisAnalysisModal';
import { RalphLaurenAnalysisModal } from './RalphLaurenAnalysisModal';

export const SourcingView: React.FC = () => {
    const [minBudget, setMinBudget] = useState<string>('10');
    const [maxBudget, setMaxBudget] = useState<string>('50');
    const [category, setCategory] = useState<string>('Streetwear / Y2K');
    const [loading, setLoading] = useState(false);
    const [opportunities, setOpportunities] = useState<SourcingOpportunity[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [copiedQuery, setCopiedQuery] = useState<number | null>(null);
    const [showLevisModal, setShowLevisModal] = useState(false);
    const [showRalphModal, setShowRalphModal] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const categories = [
        { name: "Streetwear / Y2K", emoji: "🔥" },
        { name: "Vintage Workwear", emoji: "🧥" },
        { name: "Jeans Levi's", emoji: "👖" },
        { name: "Sneakers", emoji: "👟" },
        { name: "Luxe & Créateurs", emoji: "💎" },
        { name: "Sportswear", emoji: "⚡" },
        { name: "Old Money", emoji: "🎩" }
    ];

    const handleSearch = async () => {
        if (!minBudget || !maxBudget) return;
        setLoading(true);
        setError(null);
        setOpportunities([]);

        try {
            const results = await generateSourcingAdvice(parseFloat(minBudget), parseFloat(maxBudget), category);
            setOpportunities(results);
        } catch (err: any) {
            setError(err.message || "Impossible de récupérer les tendances. Réessayez.");
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
        const url = `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(query)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="min-h-[calc(100vh-140px)] flex flex-col animate-fade-in-up">

            {/* Title & Description - Clean & Top aligned */}
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Target className="text-purple-600" />
                        Sourcing Assistant
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">
                        Trouvez les meilleures opportunités de revente en quelques clics.
                    </p>
                </div>

                {/* Menu Hamburger Implementation */}
                <div className="relative">
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors relative z-20"
                    >
                        {isMenuOpen ? <X size={24} className="text-slate-600" /> : <Menu size={24} className="text-slate-600" />}
                    </button>

                    {/* Dropdown Menu - Aligned Right */}
                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50 animate-fade-in origin-top-right">
                                <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">
                                    Guides & Outils
                                </div>
                                <button
                                    onClick={() => { setShowLevisModal(true); setIsMenuOpen(false); }}
                                    className="w-full flex items-center justify-end gap-3 px-3 py-2.5 rounded-lg hover:bg-purple-50 hover:text-purple-700 text-slate-700 transition-colors font-medium text-sm text-right"
                                >
                                    Guide Levi's Resell
                                    <BookOpen size={16} className="text-purple-500" />
                                </button>
                                <button
                                    onClick={() => { setShowRalphModal(true); setIsMenuOpen(false); }}
                                    className="w-full flex items-center justify-end gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 hover:text-blue-900 text-slate-700 transition-colors font-medium text-sm text-right"
                                >
                                    Guide Ralph Lauren
                                    <BookOpen size={16} className="text-blue-900" />
                                </button>
                                {/* Future guides placeholder */}
                                <button className="w-full flex items-center justify-end gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-slate-400 cursor-not-allowed transition-colors font-medium text-sm text-right">
                                    Bientôt: Guide Carhartt
                                    <Sparkles size={16} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Controls Bar - Minimalist White Card */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 relative z-10">
                <div className="flex flex-col xl:flex-row gap-4 xl:items-center justify-between">

                    {/* Left: Inputs */}
                    <div className="flex flex-col w-full xl:w-auto xl:flex-row xl:items-center gap-4">

                        {/* Budget Input Group - Full width on mobile */}
                        <div className="flex items-center justify-between xl:justify-start gap-2 bg-slate-50 px-4 py-3 rounded-xl border border-slate-100 w-full xl:w-auto">
                            <span className="text-sm font-bold text-slate-400 uppercase">Budget</span>
                            <div className="h-4 w-px bg-slate-300 mx-2"></div>
                            <input
                                type="number"
                                value={minBudget}
                                onChange={(e) => setMinBudget(e.target.value)}
                                className="w-16 bg-transparent text-slate-800 font-bold outline-none text-center text-lg shadow-sm rounded-md focus:bg-white transition-colors"
                                placeholder="Min"
                            />
                            <span className="text-slate-400">à</span>
                            <input
                                type="number"
                                value={maxBudget}
                                onChange={(e) => setMaxBudget(e.target.value)}
                                className="w-16 bg-transparent text-slate-800 font-bold outline-none text-center text-lg shadow-sm rounded-md focus:bg-white transition-colors"
                                placeholder="Max"
                            />
                            <span className="text-slate-600 font-bold">€</span>
                        </div>

                        {/* Category Selector - Grid on Mobile / Flex on Desktop */}
                        <div className="w-full xl:max-w-3xl">
                            <p className="text-xs font-bold text-slate-400 uppercase mb-2 xl:hidden">Catégorie</p>
                            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                                {categories.map((cat) => (
                                    <button
                                        key={cat.name}
                                        onClick={() => setCategory(cat.name)}
                                        className={`px-3 py-3 sm:py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border flex items-center justify-center sm:justify-start
                                            ${category === cat.name
                                                ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-200 scale-[1.02]'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-purple-200 hover:bg-purple-50'
                                            }`}
                                    >
                                        <span className="mr-2 text-base">{cat.emoji}</span>
                                        <span className="truncate">{cat.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Action Button - Sticky Bottom on Mobile styled */}
                    <div className="flex-shrink-0 mt-2 xl:mt-0">
                        <button
                            onClick={handleSearch}
                            disabled={loading || !minBudget || !maxBudget}
                            className="w-full xl:w-auto px-6 py-4 xl:py-3 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl font-bold shadow-lg shadow-slate-200 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg xl:text-base"
                        >
                            {loading ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} className="text-purple-400" />}
                            <span>{loading ? 'Analyse...' : 'Lancer le Sourcing'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 border border-red-100 mb-6 animate-shake">
                    <AlertCircle size={20} />
                    <span className="font-medium">{error}</span>
                </div>
            )}

            {/* Results Grid - Full Height & Modern Cards */}
            <div className="flex-1 min-h-[400px]">
                {opportunities.length === 0 && !loading && !error && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                            <Target size={24} className="text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-700">Prêt à chasser</h3>
                        <p className="text-slate-400 max-w-md mt-2">
                            Configurez votre budget et choisissez une catégorie pour révéler les meilleures opportunités du moment sur Vinted.
                        </p>
                    </div>
                )}

                {loading && (
                    <div className="h-full flex flex-col items-center justify-center p-12">
                        <div className="relative mb-6">
                            <div className="w-24 h-24 border-4 border-slate-100 rounded-full"></div>
                            <div className="w-24 h-24 border-4 border-purple-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles size={24} className="text-purple-600 animate-pulse" />
                            </div>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800">Analyse de +500 articles...</h3>
                        <p className="text-slate-400 mt-2">L'IA cherche les meilleures marges pour vous</p>
                    </div>
                )}

                {opportunities.length > 0 && (
                    <div className="animate-fade-in-up">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                                <TrendingUp className="text-emerald-500" size={24} />
                                Opportunités détectées
                            </h3>
                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                                {opportunities.length} Résultats
                            </span>
                        </div>

                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 pb-8">
                            {opportunities.map((opp, index) => (
                                <div key={index} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden">

                                    {/* Card Header - Brand & Liquidity */}
                                    <div className="p-4 border-b border-slate-50 bg-slate-50/30 flex justify-between items-start">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-1 rounded-md border border-purple-100">
                                            {opp.brand}
                                        </span>
                                        {opp.liquidity && (
                                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-sm border border-slate-100">
                                                <Gauge size={10} className={opp.liquidity.includes('Rapide') ? 'text-green-500' : 'text-orange-500'} />
                                                <span className="text-[10px] font-bold text-slate-600">{opp.liquidity}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Card Content - Name & Prices */}
                                    <div className="p-4 flex-1 flex flex-col">
                                        <h4 className="font-bold text-slate-800 mb-4 line-clamp-2 leading-snug group-hover:text-purple-700 transition-colors">
                                            {opp.itemName}
                                        </h4>

                                        <div className="mt-auto grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-xl p-2 border border-slate-100">
                                            <div>
                                                <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">Achat</span>
                                                <span className="font-bold text-slate-700">{opp.targetBuyPrice}€</span>
                                            </div>
                                            <div className="border-x border-slate-200">
                                                <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">Vente</span>
                                                <span className="font-bold text-slate-700">{opp.estimatedResellPrice}€</span>
                                            </div>
                                            <div>
                                                <span className="block text-[9px] text-emerald-600 uppercase font-bold mb-0.5">Marge</span>
                                                <span className="font-black text-emerald-500">+{opp.potentialProfit}€</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <div className="p-3 pt-0">
                                        <button
                                            onClick={() => openVintedSearch(opp.searchQuery)}
                                            className="w-full py-2.5 bg-slate-900 group-hover:bg-purple-600 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200 group-hover:shadow-purple-200"
                                        >
                                            <Search size={14} />
                                            <span>Chasser sur Vinted</span>
                                        </button>
                                        <div className="text-center mt-2">
                                            <button
                                                onClick={() => copyQuery(opp.searchQuery, index)}
                                                className="text-[10px] text-slate-400 hover:text-purple-600 font-medium flex items-center justify-center gap-1 w-full"
                                            >
                                                {copiedQuery === index ? <Check size={10} /> : <Copy size={10} />}
                                                {copiedQuery === index ? 'Copié !' : 'Copier la recherche'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            <LevisAnalysisModal isOpen={showLevisModal} onClose={() => setShowLevisModal(false)} />
            <RalphLaurenAnalysisModal isOpen={showRalphModal} onClose={() => setShowRalphModal(false)} />
        </div>
    );
};