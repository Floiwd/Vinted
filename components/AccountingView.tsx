import React, { useState, useEffect, useMemo } from 'react';
import { Transaction } from '../types';
import { StorageService } from '../services/firebase';
import { analyzeBusinessStats } from '../services/aiService';
import { fetchVintedData } from '../services/vintedService';
import { ImageUpload } from './ImageUpload';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Plus, Save, Trash2, BrainCircuit, Wallet, PieChart, Calendar, Loader2, Camera, Pencil, Filter, BarChart3, Link, Download, AlertCircle, Search } from 'lucide-react';

interface AccountingViewProps {
    history?: any[];
}

type TimeRange = 'week' | 'month' | 'year';

export const AccountingView: React.FC<AccountingViewProps> = () => {
    const { currentUser, userPreferences } = useAuth();
    const currency = userPreferences.currency === 'USD' ? '$' : userPreferences.currency === 'GBP' ? '£' : '€';

    // Helper for consistency
    const formatMoney = (amount: number) => {
        return `${amount.toFixed(0)} ${currency}`; // Simplified formatting
    };

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [timeRange, setTimeRange] = useState<TimeRange>('month');

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newBrand, setNewBrand] = useState('');
    const [newBuyPrice, setNewBuyPrice] = useState('');
    const [newSellPrice, setNewSellPrice] = useState('');
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    const [newImage, setNewImage] = useState<string>('');
    const [vintedUrl, setVintedUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    useEffect(() => {
        if (currentUser) {
            StorageService.getTransactions(currentUser.uid).then(setTransactions);
        }
    }, [currentUser]);

    const handleImageAdded = (images: Array<{ base64: string, preview: string }>) => {
        if (images.length > 0) {
            setNewImage(images[0].preview);
        }
    };

    const handleEdit = (t: Transaction) => {
        setEditingId(t.id);
        setNewTitle(t.title);
        setNewBrand(t.brand);
        setNewBuyPrice(t.buyPrice.toString());
        setNewSellPrice(t.sellPrice.toString());
        setNewDate(t.date);
        setNewImage(t.imageUrl || '');
        setShowAddForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSaveTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle || !newSellPrice || !currentUser) return;

        const transactionData = {
            title: newTitle,
            brand: newBrand || 'Inconnu',
            buyPrice: parseFloat(newBuyPrice) || 0,
            sellPrice: parseFloat(newSellPrice) || 0,
            date: newDate,
            platform: 'Vinted' as const,
            imageUrl: newImage
        };

        let updatedList = [];

        if (editingId) {
            const updatedTransaction: Transaction = {
                ...transactionData,
                id: editingId
            };
            updatedList = transactions.map(t => t.id === editingId ? updatedTransaction : t);
            await StorageService.saveTransaction(currentUser.uid, updatedTransaction);
        } else {
            const newTransaction: Transaction = {
                id: crypto.randomUUID(),
                ...transactionData
            };
            updatedList = [newTransaction, ...transactions];
            await StorageService.saveTransaction(currentUser.uid, newTransaction);
        }

        setTransactions(updatedList);
        resetForm();
    };

    const resetForm = () => {
        setNewTitle('');
        setNewBrand('');
        setNewBuyPrice('');
        setNewSellPrice('');
        setNewImage('');
        setNewDate(new Date().toISOString().split('T')[0]);
        setEditingId(null);
        setShowAddForm(false);
        setVintedUrl('');
        setImportError(null);
    };

    const handleVintedImport = async () => {
        if (!vintedUrl.trim()) return;

        setIsImporting(true);
        setImportError(null);

        try {
            const data = await fetchVintedData(vintedUrl);

            // Auto-fill form fields with Vinted data
            if (data.title) setNewTitle(data.title);
            if (data.brand) setNewBrand(data.brand);
            if (data.price) setNewSellPrice(data.price);
            if (data.imageUrl) setNewImage(data.imageUrl);
            if (data.date) setNewDate(data.date);

        } catch (error: any) {
            setImportError(error.message || 'Erreur lors de l\'import');
        } finally {
            setIsImporting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Supprimer cette vente ?')) {
            if (currentUser) {
                const updated = transactions.filter(t => t.id !== id);
                setTransactions(updated);
                await StorageService.deleteTransaction(currentUser.uid, id);
            }
        }
    };

    const runAnalysis = async () => {
        setIsAnalyzing(true);
        const result = await analyzeBusinessStats(transactions);
        setAiAnalysis(result);
        setIsAnalyzing(false);
    };

    const stats = useMemo(() => {
        let totalRevenue = 0;
        let totalSpend = 0;

        transactions.forEach(t => {
            totalRevenue += t.sellPrice;
            totalSpend += t.buyPrice;
        });

        const totalProfit = totalRevenue - totalSpend;
        const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

        return { totalRevenue, totalSpend, totalProfit, margin };
    }, [transactions]);

    // Chart Data Logic
    const chartData = useMemo(() => {
        const data: Record<string, { income: number, expense: number, profit: number, label: string }> = {};
        const now = new Date();

        transactions.forEach(t => {
            const tDate = new Date(t.date);
            let key = '';
            let label = '';

            if (timeRange === 'week') {
                // Group by day for the last 7 days? Or group by week?
                // Let's do: Last 7 days individually
                const diffTime = Math.abs(now.getTime() - tDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 7) {
                    key = tDate.toISOString().split('T')[0];
                    label = tDate.toLocaleDateString('fr-FR', { weekday: 'short' });
                }
            } else if (timeRange === 'month') {
                // Group by Month (Last 6 months)
                const diffMonths = (now.getFullYear() - tDate.getFullYear()) * 12 + (now.getMonth() - tDate.getMonth());
                if (diffMonths < 6) {
                    key = `${tDate.getFullYear()}-${tDate.getMonth()}`;
                    label = tDate.toLocaleDateString('fr-FR', { month: 'short' });
                }
            } else if (timeRange === 'year') {
                // Group by Year
                key = tDate.getFullYear().toString();
                label = key;
            }

            if (key) {
                if (!data[key]) data[key] = { income: 0, expense: 0, profit: 0, label };
                data[key].income += t.sellPrice;
                data[key].expense += t.buyPrice;
                data[key].profit = data[key].income - data[key].expense;
            }
        });

        // Sort keys
        return Object.entries(data).sort().slice(-7); // Limit to last 7 items to fit screen
    }, [transactions, timeRange]);

    const maxChartValue = Math.max(...chartData.map(([_, d]) => Math.max(d.income, d.expense, d.profit)), 100);

    return (
        <div className="space-y-8 animate-fade-in-up pb-20">

            {/* KPI Cards */}
            <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-bold">Mon Business</h2>
                        <p className="text-slate-400 text-sm">Tableau de bord financier</p>
                    </div>
                    <button
                        onClick={() => { resetForm(); setShowAddForm(!showAddForm); }}
                        className="bg-vinted hover:bg-vinted-dark text-white px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 transition-all shadow-lg hover:scale-105"
                    >
                        <Plus size={18} />
                        Nouvelle Vente
                    </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white/10 rounded-xl p-4 border border-white/5">
                        <span className="text-slate-400 text-xs font-bold uppercase block mb-1">Chiffre d'Affaires</span>
                        <span className="text-2xl font-black">{formatMoney(stats.totalRevenue)}</span>
                    </div>
                    <div className="bg-emerald-500/20 rounded-xl p-4 border border-emerald-500/30">
                        <span className="text-emerald-300 text-xs font-bold uppercase block mb-1">Bénéfice Net</span>
                        <span className="text-2xl font-black text-emerald-400">+{formatMoney(stats.totalProfit)}</span>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 border border-white/5">
                        <span className="text-slate-400 text-xs font-bold uppercase block mb-1">Marge</span>
                        <span className="text-2xl font-black">{stats.margin.toFixed(0)}%</span>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 border border-white/5">
                        <span className="text-red-300 text-xs font-bold uppercase block mb-1">Dépenses</span>
                        <span className="text-2xl font-black text-red-200">{formatMoney(stats.totalSpend)}</span>
                    </div>
                </div>
            </div>

            {/* Chart Section */}
            {transactions.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 self-start">
                            <BarChart3 className="text-vinted" />
                            Analyse Graphique
                        </h3>

                        <div className="flex bg-slate-100 p-1 rounded-lg self-start md:self-auto">
                            {(['week', 'month', 'year'] as TimeRange[]).map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setTimeRange(r)}
                                    className={`px-3 py-1 rounded-md text-xs font-bold capitalize transition-all ${timeRange === r
                                        ? 'bg-white text-vinted shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    {r === 'week' ? '7 Jours' : r === 'month' ? 'Mois' : 'Année'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="h-64 flex items-end justify-between gap-2 px-2 pb-2">
                        {chartData.map(([key, data]) => (
                            <div key={key} className="flex flex-col items-center flex-1 h-full justify-end group relative">

                                {/* TOOLTIP */}
                                <div className="absolute bottom-full mb-2 bg-slate-800 text-white text-xs p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none whitespace-nowrap shadow-xl">
                                    <div className="font-bold border-b border-white/10 pb-1 mb-1">{data.label}</div>
                                    <div className="flex justify-between gap-3 text-emerald-400"><span>Profit:</span> <span>{formatMoney(data.profit)}</span></div>
                                    <div className="flex justify-between gap-3 text-white"><span>CA:</span> <span>{formatMoney(data.income)}</span></div>
                                    <div className="flex justify-between gap-3 text-red-300"><span>Coûts:</span> <span>{formatMoney(data.expense)}</span></div>
                                    <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                                </div>

                                <div className="w-full flex gap-[2px] md:gap-1 items-end justify-center h-full relative px-1 md:px-2">
                                    {/* COST BAR */}
                                    <div
                                        className="flex-1 bg-red-300 rounded-t-sm hover:bg-red-400 transition-colors"
                                        style={{ height: `${Math.max(4, (data.expense / maxChartValue) * 100)}%` }}
                                    />
                                    {/* PROFIT BAR */}
                                    <div
                                        className="flex-1 bg-emerald-400 rounded-t-sm hover:bg-emerald-500 transition-colors"
                                        style={{ height: `${Math.max(4, (data.profit / maxChartValue) * 100)}%` }}
                                    />
                                    {/* INCOME BAR */}
                                    <div
                                        className="flex-1 bg-slate-200 rounded-t-sm hover:bg-slate-300 transition-colors"
                                        style={{ height: `${Math.max(4, (data.income / maxChartValue) * 100)}%` }}
                                    />
                                </div>

                                <span className="text-[10px] font-bold text-slate-400 mt-3">{data.label}</span>
                            </div>
                        ))}
                        {chartData.length === 0 && (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                                Données insuffisantes pour cette période
                            </div>
                        )}
                    </div>
                    <div className="flex justify-center gap-4 mt-4 text-[10px] font-bold text-slate-500 uppercase">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-300 rounded-full"></div> Coûts</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-400 rounded-full"></div> Profit</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-slate-200 rounded-full"></div> Chiffre d'Affaires</span>
                    </div>
                </div>
            )}

            {/* Form & AI Section remains same, just ensuring closing tags match */}

            {showAddForm && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 animate-fade-in">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Wallet size={20} className="text-vinted" />
                        {editingId ? 'Modifier la vente' : 'Enregistrer une vente'}
                    </h3>

                    {/* Vinted URL Import - Premium Design */}
                    {!editingId && (
                        <div className="mb-6 rounded-2xl overflow-hidden border-2 border-teal-200 bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-500 p-[2px]">
                            <div className="bg-white rounded-xl p-4 sm:p-5 relative overflow-hidden">
                                {/* Background decoration */}
                                <div className="absolute -right-10 -top-10 w-32 h-32 bg-teal-100 rounded-full opacity-50 blur-2xl"></div>

                                <div className="relative z-10">
                                    {/* Header */}
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-xl text-white shadow-lg shadow-teal-500/20">
                                            <Link size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">Import rapide Vinted</h4>
                                            <p className="text-xs text-slate-500">Collez le lien → Auto-remplissage des champs</p>
                                        </div>
                                    </div>

                                    {/* URL Input */}
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <div className="flex-1 relative">
                                            <input
                                                type="url"
                                                placeholder="https://www.vinted.fr/items/123456789-titre-article"
                                                value={vintedUrl}
                                                onChange={e => setVintedUrl(e.target.value)}
                                                className="w-full p-3.5 pl-10 bg-slate-50 border-2 border-slate-200 rounded-xl font-medium text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                                            />
                                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleVintedImport}
                                            disabled={isImporting || !vintedUrl.trim()}
                                            className="px-6 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold rounded-xl hover:from-teal-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-500/20 active:scale-[0.98] min-w-[140px]"
                                        >
                                            {isImporting ? (
                                                <>
                                                    <Loader2 size={18} className="animate-spin" />
                                                    <span>Import...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Download size={18} />
                                                    <span>Importer</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {/* Error state */}
                                    {importError && (
                                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600">
                                            <AlertCircle size={16} className="shrink-0" />
                                            <span className="text-sm font-medium">{importError}</span>
                                        </div>
                                    )}

                                    {/* Success hint - shows what will be imported */}
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-full">
                                            📦 Titre
                                        </span>
                                        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-full">
                                            🏷️ Marque
                                        </span>
                                        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-full">
                                            💰 Prix
                                        </span>
                                        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-full">
                                            📸 Photo
                                        </span>
                                        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-full">
                                            📅 Date
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSaveTransaction} className="space-y-4">
                        {/* Form fields same as before... */}
                        <div className="flex gap-4">
                            <div className="w-24 h-24 shrink-0">
                                {newImage ? (
                                    <div className="w-full h-full relative rounded-xl overflow-hidden border border-slate-200 group">
                                        <img src={newImage} alt="Preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => setNewImage('')}
                                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-full h-full">
                                        <ImageUpload onImagesSelected={handleImageAdded} compact={true} />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Article</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Sweat Nike Vintage"
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-vinted outline-none"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Marque</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Nike"
                                    value={newBrand}
                                    onChange={e => setNewBrand(e.target.value)}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-vinted outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                                <input
                                    type="date"
                                    value={newDate}
                                    onChange={e => setNewDate(e.target.value)}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-vinted outline-none"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prix Achat ({currency})</label>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    step="0.01"
                                    value={newBuyPrice}
                                    onChange={e => setNewBuyPrice(e.target.value)}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-vinted outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prix Vente ({currency})</label>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    step="0.01"
                                    value={newSellPrice}
                                    onChange={e => setNewSellPrice(e.target.value)}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-vinted outline-none"
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={resetForm}
                                className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                className="flex-1 py-3 bg-vinted text-white font-bold rounded-xl shadow-md hover:bg-vinted-dark flex items-center justify-center gap-2"
                            >
                                <Save size={18} />
                                {editingId ? 'Mettre à jour' : 'Enregistrer'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* AI Section */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                            <BrainCircuit size={24} className="text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">Coach Business IA</h3>
                            <p className="text-indigo-200 text-xs">Analyse stratégique de vos ventes</p>
                        </div>
                    </div>

                    {!aiAnalysis ? (
                        <div className="text-center py-4">
                            <p className="text-indigo-100 text-sm mb-4">
                                Laissez l'IA analyser vos {transactions.length} ventes pour détecter les tendances et optimiser vos profits.
                            </p>
                            <button
                                onClick={runAnalysis}
                                disabled={isAnalyzing || transactions.length === 0}
                                className="bg-white text-indigo-700 font-bold py-2.5 px-6 rounded-xl shadow-lg hover:bg-indigo-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
                            >
                                {isAnalyzing ? <Loader2 className="animate-spin" /> : <TrendingUp size={18} />}
                                {isAnalyzing ? "Analyse en cours..." : "Analyser mon Business"}
                            </button>
                        </div>
                    ) : (
                        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-sm leading-relaxed border border-white/10 animate-fade-in">
                            <div className="markdown-prose text-indigo-50 space-y-2">
                                {aiAnalysis.split('\n').map((line, i) => (
                                    <p key={i}>{line}</p>
                                ))}
                            </div>
                            <button
                                onClick={() => setAiAnalysis(null)}
                                className="mt-4 text-xs font-bold text-indigo-300 hover:text-white underline"
                            >
                                Nouvelle analyse
                            </button>
                        </div>
                    )}
                </div>
                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-purple-500 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
            </div>

            {/* Transaction List */}
            <div>
                <h3 className="font-bold text-slate-800 mb-4 px-2">Historique des ventes ({transactions.length})</h3>
                <div className="space-y-3">
                    {transactions.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-100 border-dashed">
                            <p>Aucune vente enregistrée.</p>
                            <p className="text-sm">Utilisez le bouton "Nouvelle Vente" en haut.</p>
                        </div>
                    ) : (
                        transactions.map(t => (
                            <div key={t.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-vinted transition-colors">
                                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                    <div className="w-12 h-12 rounded-lg bg-slate-100 shrink-0 border border-slate-200 overflow-hidden">
                                        {t.imageUrl ? (
                                            <img src={t.imageUrl} alt={t.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <Camera size={16} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <h4 className="font-bold text-slate-800 truncate">{t.title}</h4>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase font-bold text-[10px]">{t.brand}</span>
                                            <span className="text-slate-400 flex items-center gap-1"><Calendar size={10} /> {new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' })}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right mr-3 ml-2 shrink-0">
                                    <div className="font-black text-emerald-600">+{t.sellPrice} {currency}</div>
                                    {t.buyPrice > 0 && <div className="text-xs text-slate-400">-{t.buyPrice} {currency}</div>}
                                </div>

                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={() => handleEdit(t)}
                                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors shrink-0"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(t.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

        </div>
    );
};
