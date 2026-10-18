
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/firebase';
import { HistoryItem, Transaction } from '../types';
import { Loader2, LogOut, User, DollarSign, Scan, ShoppingBag, Settings, HelpCircle, ChevronRight, ArrowLeft, Mail, Globe, CreditCard } from 'lucide-react';

type ProfileSection = 'main' | 'settings' | 'support';

export const ProfileView: React.FC = () => {
    const { currentUser, logout, userPreferences, updatePreferences } = useAuth();
    const [loading, setLoading] = useState(true);
    const [section, setSection] = useState<ProfileSection>('main');



    const [stats, setStats] = useState({
        totalScans: 0,
        totalSales: 0,
        totalProfit: 0,
        pendingStock: 0
    });

    useEffect(() => {
        const loadStats = async () => {
            if (!currentUser) {
                setLoading(false);
                return;
            }

            try {
                const [history, transactions] = await Promise.all([
                    StorageService.getHistory(currentUser.uid),
                    StorageService.getTransactions(currentUser.uid)
                ]);

                // Calculate Stats
                const totalScans = history.length;
                const totalSales = transactions.length;

                let totalRevenue = 0;
                let totalCoast = 0;

                transactions.forEach(t => {
                    totalRevenue += t.sellPrice;
                    totalCoast += t.buyPrice;
                });

                const totalProfit = totalRevenue - totalCoast;

                setStats({
                    totalScans,
                    totalSales,
                    totalProfit,
                    pendingStock: 0
                });

            } catch (error) {
                console.error("Error loading profile stats:", error);
            } finally {
                setLoading(false);
            }
        };

        loadStats();
    }, [currentUser]);

    // Non-blocking loading: we display the UI immediately with default stats
    // if (loading) { return ... } -> Removed to allow immediate access to Settings/Support

    // --- RENDER SECTIONS ---

    if (section === 'settings') {
        return (
            <div className="space-y-6 animate-fade-in-up">
                <button
                    onClick={() => setSection('main')}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors"
                >
                    <ArrowLeft size={20} />
                    Retour
                </button>

                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Settings size={24} className="text-vinted" />
                    Paramètres
                </h2>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                            <Globe size={16} className="text-slate-400" />
                            Langue
                        </label>
                        <select
                            value={userPreferences.language}
                            onChange={(e) => updatePreferences({ language: e.target.value })}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-vinted text-slate-800"
                        >
                            <option value="fr">Français</option>
                            <option value="en">English (US)</option>
                            <option value="es">Español</option>
                            <option value="de">Deutsch</option>
                            <option value="it">Italiano</option>
                        </select>
                    </div>
                    <div className="p-4">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                            <CreditCard size={16} className="text-slate-400" />
                            Devise
                        </label>
                        <select
                            value={userPreferences.currency}
                            onChange={(e) => updatePreferences({ currency: e.target.value })}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-vinted text-slate-800"
                        >
                            <option value="EUR">Euro (€)</option>
                            <option value="USD">Dollar ($)</option>
                            <option value="GBP">Livre (£)</option>
                        </select>
                    </div>
                </div>
            </div>
        );
    }

    if (section === 'support') {
        return (
            <div className="space-y-6 animate-fade-in-up">
                <button
                    onClick={() => setSection('main')}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors"
                >
                    <ArrowLeft size={20} />
                    Retour
                </button>

                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <HelpCircle size={24} className="text-vinted" />
                    Support & Aide
                </h2>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
                        <Mail size={32} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">Besoin d'aide ?</h3>
                        <p className="text-slate-500 text-sm mt-1">
                            Vous pouvez me contacter directement à cette adresse :
                        </p>
                    </div>

                    <a
                        href="mailto:duranflorian88@gmail.com"
                        className="block w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 hover:bg-slate-100 hover:border-slate-300 transition-all text-sm break-all"
                    >
                        duranflorian88@gmail.com
                    </a>

                    <p className="text-xs text-slate-400">
                        Réponse généralement sous 24h.
                    </p>
                </div>
            </div>
        );
    }

    // --- MAIN PROFILE VIEW ---

    return (
        <div className="space-y-6 animate-fade-in-up pb-20">
            {/* Header Card */}
            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/50 shadow-xl shadow-indigo-200/20 text-center">
                <div className="w-20 h-20 bg-vinted/10 rounded-full flex items-center justify-center mx-auto mb-4 text-vinted ring-4 ring-white shadow-sm">
                    <User size={40} />
                </div>
                <h2 className="text-xl font-bold text-slate-800">{currentUser?.email}</h2>
                <span className="inline-block mt-2 px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold rounded-full shadow-md flex items-center gap-1 justify-center w-fit mx-auto">
                    {loading && <Loader2 size={12} className="animate-spin" />}
                    Membre PRO
                </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2">
                    <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                        <Scan size={20} />
                    </div>
                    <span className="text-2xl font-black text-slate-800">{stats.totalScans}</span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scans IA</span>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2">
                    <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
                        <ShoppingBag size={20} />
                    </div>
                    <span className="text-2xl font-black text-slate-800">{stats.totalSales}</span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ventes</span>
                </div>

                <div className="col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl shadow-xl text-white relative overflow-hidden">
                    <div className="relative z-10 flex justify-between items-center">
                        <div>
                            <span className="block text-slate-400 text-xs font-bold uppercase mb-1">Profit Total</span>
                            <span className="text-3xl font-black text-emerald-400">+{stats.totalProfit.toFixed(2)} €</span>
                        </div>
                        <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                            <DollarSign size={24} className="text-emerald-400" />
                        </div>
                    </div>
                    {/* Decorative background element */}
                    <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl"></div>
                </div>
            </div>

            {/* Actions */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                <button
                    onClick={() => setSection('settings')}
                    className="w-full py-3 px-4 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700 transition-colors">
                            <Settings size={18} />
                        </div>
                        <span className="font-bold text-slate-700 text-sm">Paramètres</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                    onClick={() => setSection('support')}
                    className="w-full py-3 px-4 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700 transition-colors">
                            <HelpCircle size={18} />
                        </div>
                        <span className="font-bold text-slate-700 text-sm">Support & Aide</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>

            <button
                onClick={() => logout()}
                className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
                <LogOut size={18} />
                Se déconnecter
            </button>
        </div>
    );
};