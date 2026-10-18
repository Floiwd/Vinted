import React, { useState } from 'react';
import { ListingData, DefectItem } from '../types';
import { Copy, Check, Tag, Info, ShoppingBag, TrendingUp, TrendingDown, ShieldCheck, ShieldAlert, ShieldQuestion, Zap, Share2, AlertTriangle, Eye, X, Ruler, Box, Star, Euro, Sparkles } from 'lucide-react';

interface ResultCardProps {
    data: ListingData;
    images?: string[]; // Images previews
}

export const ResultCard: React.FC<ResultCardProps> = ({ data, images }) => {
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [verifiedDefects, setVerifiedDefects] = useState<DefectItem[]>([]);
    const [rejectedDefects, setRejectedDefects] = useState<string[]>([]);

    const handleVerifyDefect = (defect: DefectItem, index: number, isConfirmed: boolean) => {
        if (isConfirmed) {
            setVerifiedDefects(prev => [...prev, defect]);
        } else {
            setRejectedDefects(prev => [...prev, `${index}`]);
        }
    };

    const getFinalDescription = () => {
        let desc = data.description;

        // Ajout des défauts validés
        if (verifiedDefects.length > 0) {
            desc += "\n\n⚠️ DÉFAUTS SIGNALÉS (Transparence) :\n";
            verifiedDefects.forEach(d => {
                desc += `• ${d.type} : ${d.location}\n`;
            });
        }

        return desc;
    };

    const copyToClipboard = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleNativeShare = async () => {
        const fullText = `${data.title}\n\n${getFinalDescription()}\n\nPrix : ${data.estimatedPrice} €`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: data.title,
                    text: fullText,
                });
            } catch (error) {
                console.log('Error sharing:', error);
            }
        } else {
            copyToClipboard(fullText, 'full');
        }
    };

    const parsePrice = (p?: string) => parseFloat(p?.replace(/[^0-9.]/g, '') || '0');

    const estimatedPriceNum = parsePrice(data.estimatedPrice);
    const purchasePriceNum = parsePrice(data.purchasePrice);
    const minPriceNum = parsePrice(data.minPrice) || estimatedPriceNum * 0.8;
    const maxPriceNum = parsePrice(data.maxPrice) || estimatedPriceNum * 1.2;

    const profit = estimatedPriceNum - purchasePriceNum;
    const hasProfit = profit > 0;
    const showProfit = purchasePriceNum > 0 && estimatedPriceNum > 0;
    const roi = purchasePriceNum > 0 ? ((profit / purchasePriceNum) * 100).toFixed(0) : 0;

    const getAuthenticityUI = () => {
        if (!data.authenticity) return null;
        // Fix potential NaN if confidence is undefined
        let rawConfidence = data.authenticity.confidence ?? 0;
        // Handle decimal (0.95 -> 95) vs integer (95 -> 95)
        if (rawConfidence <= 1 && rawConfidence > 0) {
            rawConfidence = rawConfidence * 100;
        }
        const confidence = Math.min(Math.max(Math.round(rawConfidence), 0), 100);

        if (data.authenticity.status === 'Authentique') {
            return { color: 'bg-emerald-50/80 border-emerald-100 text-emerald-800', icon: <ShieldCheck className="text-emerald-500" size={24} />, label: 'Legit Check : OK', confidence };
        } else if (data.authenticity.status === 'Suspect') {
            return { color: 'bg-red-50/80 border-red-100 text-red-800', icon: <ShieldAlert className="text-red-500" size={24} />, label: 'Suspect / Fake', confidence };
        } else {
            return { color: 'bg-amber-50/80 border-amber-100 text-amber-800', icon: <ShieldQuestion className="text-amber-500" size={24} />, label: 'Authenticité Incertaine', confidence };
        }
    };

    const authUI = getAuthenticityUI();
    const potentialDefects = data.defects || [];
    const finalDescription = getFinalDescription();

    return (
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-200/20 border border-white/50 animate-fade-in-up ring-1 ring-white/60 relative">
            {/* Banner */}
            <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 py-4 flex justify-between items-center shadow-lg relative z-10 overflow-hidden rounded-t-3xl">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
                <h2 className="text-white font-black text-lg flex items-center gap-2.5 relative z-10">
                    <ShoppingBag size={20} className="text-purple-200" />
                    <span className="tracking-tight">Résultat Optimisé</span>
                </h2>
                <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 shadow-lg relative z-10 hover:bg-white/20 transition-colors">
                    <Zap size={12} className="text-amber-300 fill-amber-300 animate-pulse" />
                    <span className="text-white text-[10px] font-bold uppercase tracking-wide">AI Pro v2</span>
                </div>
            </div>

            <div className="p-6 md:p-8 space-y-8 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-purple-50/50 to-white pointer-events-none -z-10"></div>

                {/* TOP SECTION: IMAGES & CATEGORIES */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* IMAGES CAROUSEL/GRID */}
                    {images && images.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto pb-4 snap-x scrollbar-hide">
                            {images.map((img, idx) => (
                                <div key={idx} className="shrink-0 w-32 h-32 rounded-2xl overflow-hidden border-2 border-white shadow-xl shadow-purple-200/50 snap-center hover:scale-105 transition-transform duration-300 cursor-pointer">
                                    <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* CATEGORIES GRID */}
                    <div className="grid grid-cols-2 gap-3">
                        <InfoItem label="Marque" value={data.brand} icon={<Tag size={14} />} />
                        <InfoItem label="Taille" value={data.size} icon={<Ruler size={14} />} />
                        <InfoItem label="État" value={data.condition} icon={<Star size={14} />} />
                        <InfoItem label="Catégorie" value={data.category || 'Vêtement'} icon={<Box size={14} />} />
                    </div>
                </div>

                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

                {/* MAIN ANALYSIS */}
                <div className="flex flex-col md:flex-row gap-8">

                    {/* LEFT COLUMN */}
                    <div className="w-full md:w-5/12 space-y-6 shrink-0">

                        {/* TITRE */}
                        <div className="space-y-2 group">
                            <div className="flex justify-between items-end">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Tag size={14} /> Titre Optimisé
                                </label>
                                <button
                                    onClick={() => copyToClipboard(data.title, 'title')}
                                    className="text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm border border-violet-100"
                                >
                                    {copiedField === 'title' ? <Check size={12} /> : <Copy size={12} />}
                                    Copier
                                </button>
                            </div>
                            <div className="p-4 bg-white/80 border border-slate-200 rounded-2xl text-slate-800 font-bold shadow-sm group-hover:border-violet-300 transition-colors select-all leading-snug">
                                {data.title}
                            </div>
                        </div>

                        {/* PRICE CARD & BAR */}
                        <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white/60 shadow-xl shadow-slate-200/40 p-5 space-y-4 backdrop-blur-sm relative">
                            <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
                                <Euro size={80} />
                            </div>

                            <div className="flex justify-between items-start relative z-10">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prix conseillé</span>
                                        <div className="group/tooltip relative z-50">
                                            <AlertTriangle size={12} className="text-amber-400 cursor-help" />
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-slate-800 text-white text-[10px] p-2 rounded-lg opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity shadow-lg leading-relaxed font-medium transform -translate-y-1 group-hover/tooltip:translate-y-0 duration-200">
                                                <div className="absolute top-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                                                Estimation IA basée sur le marché actuel. Vérifiez toujours la concurrence sur Vinted.
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-baseline gap-1 text-slate-900">
                                        <span className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">{estimatedPriceNum.toFixed(0)}</span>
                                        <span className="text-xl font-bold text-slate-400">€</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(data.estimatedPrice, 'price')}
                                    className="bg-white p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:border-violet-500 hover:text-violet-600 hover:shadow-md transition-all active:scale-95"
                                >
                                    {copiedField === 'price' ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>

                            {/* Price Range Bar: Red | Orange | Green | Orange | Red */}
                            <div className="pt-2">
                                <div className="h-3 w-full rounded-full flex overflow-hidden ring-2 ring-white shadow-inner">
                                    <div className="h-full bg-red-400 w-[15%]" />
                                    <div className="h-full bg-orange-400 w-[20%]" />
                                    <div className="h-full bg-emerald-500 w-[30%]" />
                                    <div className="h-full bg-orange-400 w-[20%]" />
                                    <div className="h-full bg-red-400 w-[15%]" />
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-2 font-mono">
                                    <span>{minPriceNum.toFixed(0)}€</span>
                                    <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{estimatedPriceNum.toFixed(0)}€</span>
                                    <span>{maxPriceNum.toFixed(0)}€</span>
                                </div>
                            </div>

                            {/* Profit Section */}
                            {showProfit && (
                                <div className={`mt-2 p-4 rounded-xl flex items-center justify-between border ${hasProfit ? 'bg-emerald-50/50 border-emerald-100/50 text-emerald-900' : 'bg-red-50/50 border-red-100/50 text-red-900'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${hasProfit ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                            {hasProfit ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                        </div>
                                        <div>
                                            <span className="font-bold text-xs uppercase tracking-wider opacity-70 block">Marge Nette</span>
                                            <span className={`font-black text-xl leading-none ${hasProfit ? 'text-emerald-600' : 'text-red-500'}`}>{hasProfit ? '+' : ''}{profit.toFixed(2)}€</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold uppercase opacity-50 mb-1">Retour Inv.</div>
                                        <div className={`text-sm font-black px-2 py-1 rounded ${hasProfit ? 'bg-emerald-200/50 text-emerald-800' : 'bg-red-200/50 text-red-800'}`}>
                                            {roi}%
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* AUTHENTICITY */}
                        {authUI && data.authenticity && (
                            <div className={`p-5 rounded-2xl border flex items-start gap-4 ${authUI.color} shadow-sm backdrop-blur-sm relative overflow-hidden transition-all hover:shadow-md`}>
                                <div className="shrink-0 mt-1 bg-white p-2 rounded-full shadow-sm">{authUI.icon}</div>
                                <div className="w-full relative z-10">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-black text-sm uppercase tracking-wide">{authUI.label.split(':')[1] || authUI.label}</span>
                                        <span className="font-bold text-[10px] bg-white/80 px-2 py-1 rounded-lg border border-black/5 backdrop-blur-sm shadow-sm">
                                            Certitude: {authUI.confidence}%
                                        </span>
                                    </div>
                                    {/* Aesthetic Bar for Confidence */}
                                    <div className="w-full bg-black/5 h-2 rounded-full mt-2 mb-3 overflow-hidden shadow-inner">
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 ease-out ${authUI.confidence > 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : authUI.confidence > 50 ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
                                            style={{ width: `${authUI.confidence}%` }}
                                        />
                                    </div>
                                    <div className="text-xs font-medium opacity-90 leading-relaxed border-l-2 border-black/10 pl-3 italic">
                                        "{data.authenticity.reason}"
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="w-full md:w-7/12 flex flex-col h-full bg-white/50 rounded-2xl p-1 border border-white/50 backdrop-blur-sm shadow-inner">
                        {/* Same Description Block but with proper spacing */}
                        <div className="flex justify-between items-end p-3 pb-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Info size={14} /> Description Vinted
                            </label>
                            <button
                                onClick={() => copyToClipboard(finalDescription, 'description')}
                                className="text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm border border-violet-100"
                            >
                                {copiedField === 'description' ? <Check size={12} /> : <Copy size={12} />}
                                Copier
                            </button>
                        </div>

                        <div className="relative grow flex flex-col p-1">
                            <textarea
                                readOnly
                                value={finalDescription}
                                className="w-full min-h-[400px] md:h-full p-6 bg-white border border-slate-100 rounded-xl text-sm text-slate-700 font-medium leading-loose resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/20 shadow-sm transition-colors whitespace-pre-wrap"
                            />
                            <div className="absolute bottom-4 right-4 text-[10px] font-bold text-violet-500 bg-violet-50 border border-violet-100 px-2.5 py-1.5 rounded-lg backdrop-blur-sm pointer-events-none flex items-center gap-1">
                                <Sparkles size={10} /> Optimisé Vinted
                            </div>
                        </div>

                        <div className="p-3 pt-1">
                            <button
                                onClick={handleNativeShare}
                                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-xl shadow-slate-900/20 hover:shadow-2xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2 group active:scale-[0.99]"
                            >
                                {copiedField === 'full' ? (
                                    <>
                                        <Check size={18} className="text-emerald-400" />
                                        <span>Copié dans le presse-papier !</span>
                                    </>
                                ) : (
                                    <>
                                        <Share2 size={18} className="group-hover:-translate-y-0.5 transition-transform text-violet-300" />
                                        <span>Copier / Partager Tout</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Also updated InfoItem with glass style
const InfoItem = ({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) => (
    <div className="bg-white/60 border border-slate-200/60 rounded-xl p-3 flex flex-col gap-1 shadow-sm backdrop-blur-sm hover:bg-white hover:shadow-md transition-all group">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-violet-500 transition-colors">
            {icon} {label}
        </span>
        <span className="font-bold text-slate-800 text-sm truncate" title={value}>
            {value || '-'}
        </span>
    </div>
);