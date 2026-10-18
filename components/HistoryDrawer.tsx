import React from 'react';
import { HistoryItem } from '../types';
import { X, Calendar, ChevronRight, Trash2, ShoppingBag, TrendingUp, Wallet, Package, TrendingDown } from 'lucide-react';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onSelect,
  onDelete
}) => {
  // Calculate Global Stats
  const stats = history.reduce((acc, item) => {
    const est = parseFloat(item.data.estimatedPrice?.replace(/[^0-9.]/g, '') || '0');
    const buy = item.data.purchasePrice ? parseFloat(item.data.purchasePrice) : 0;

    acc.totalValue += est;
    if (buy > 0) {
      acc.totalProfit += (est - buy);
      acc.trackedItems += 1; // Only count items where purchase price was tracked for profit
    }
    return acc;
  }, { totalValue: 0, totalProfit: 0, trackedItems: 0 });

  const isProfitable = stats.totalProfit >= 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <ShoppingBag size={20} className="text-vinted" />
              Mon Espace
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Stats Dashboard */}
          {history.length > 0 && (
            <div className="p-4 bg-white border-b border-slate-100">
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 text-white shadow-lg">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Performances Estimées</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-slate-300 text-xs mb-1">
                      <Wallet size={12} />
                      <span>Valeur Stock</span>
                    </div>
                    <span className="text-xl font-bold">{stats.totalValue.toFixed(0)} €</span>
                  </div>
                  <div>
                    <div className={`flex items-center gap-1.5 text-xs mb-1 ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfitable ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      <span>{isProfitable ? 'Bénéfice Pot.' : 'Perte Globale'}</span>
                    </div>
                    <span className={`text-xl font-bold ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {stats.totalProfit > 0 ? '+' : ''}{stats.totalProfit.toFixed(0)} €
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700 flex justify-between items-center text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Package size={12} />
                    {history.length} annonce{history.length > 1 ? 's' : ''}
                  </span>
                  {stats.trackedItems > 0 && (
                    <span className={`px-2 py-0.5 rounded-full font-medium ${isProfitable ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-400 bg-red-400/10'}`}>
                      {isProfitable ? 'Rentable' : 'Déficitaire'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
            {history.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
                <Calendar size={48} className="mb-4 opacity-20" />
                <p>Aucune annonce sauvegardée.</p>
                <p className="text-sm mt-2">Commencez à scanner vos vêtements !</p>
              </div>
            ) : (
              history.map((item) => {
                // Calculate profit for display
                const estimated = parseFloat(item.data.estimatedPrice?.replace(/[^0-9.]/g, '') || '0');
                const purchase = item.data.purchasePrice ? parseFloat(item.data.purchasePrice) : 0;
                const profit = estimated - purchase;
                const hasProfitInfo = purchase > 0 && estimated > 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => onSelect(item)}
                    className="bg-white border border-slate-200 rounded-xl p-3 flex gap-3 cursor-pointer hover:border-vinted hover:shadow-md transition-all group"
                  >
                    <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-slate-100">
                      <img src={item.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h3 className="font-bold text-slate-800 text-sm truncate">{item.data.title}</h3>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mt-1">
                        {/* Price */}
                        <span className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {item.data.estimatedPrice} €
                        </span>

                        {/* Profit */}
                        {hasProfitInfo && (
                          <span className={`font-semibold flex items-center gap-0.5 ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {profit > 0 ? '+' : ''}{parseFloat(profit.toFixed(2))} €
                          </span>
                        )}

                        {/* Date */}
                        <span className="text-slate-400 ml-auto text-[10px]">
                          {new Date(item.timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between items-end pl-1">
                      <button
                        onClick={(e) => onDelete(item.id, e)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
};