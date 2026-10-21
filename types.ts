
export interface DefectItem {
  type: string;       // ex: "Tache", "Trou", "Bouloches", "Décoloration"
  location: string;   // ex: "Sur la manche gauche", "Près du col"
  confidence: number; // Score 0-100
}

export interface MarketVerdict {
  verdict: "EXCELLENT_SOURCING" | "ACHAT_CORRECT" | "ACHAT_TROP_CHER";
  verdict_label: string;
  analyse: string;
  prix_vente_rapide: number;
  prix_marche_moyen: number;
  prix_affiche_recommande: number;
  prix_plancher: number;
  contre_offre: number;
  velocite: "TRES_RAPIDE" | "NORMALE" | "LENTE";
  velocite_label: string;
  conseil_rotation: string;
}

export interface SourcingAnalysis {
  verdict: "FONCE" | "NEGOCIE" | "SKIP";
  badge: string;
  titre: string;
  avis_sincere: string;
  prix_affiche_vendeur: number;
  frais_estimes: number;
  cout_total_achat: number;
  prix_revente_rapide: number;
  prix_revente_optimiste: number;
  benefice_net_estime: number;
  roi_estime_pourcent: number;
  delai_vente_estime: string;
  offre_suggeree: number;
  message_offre: string;
  points_forts: string[];
  points_vigilance: string[];
}

export interface ListingData {
  title: string;
  titre_court?: string;
  titre_seo?: string;
  description: string;
  estimatedPrice: string;
  brand: string;
  size: string;
  condition: string;
  category: string; // [NEW] Type/Catégorie
  colors: string[];
  defects?: DefectItem[];
  defauts_observes?: string[];
  defauts_transparence?: string;
  hashtags?: string;
  market_verdict?: MarketVerdict;
  sourcing_analysis?: SourcingAnalysis;
  purchasePrice?: string; // Prix d'achat utilisateur
  minPrice?: string; // [NEW] Prix min estimé
  maxPrice?: string; // [NEW] Prix max estimé
  authenticity?: {
    status: 'Authentique' | 'Suspect' | 'Incertain';
    confidence: number;
    reason: string;
  };
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  thumbnail: string;
  images?: string[];
  data: ListingData;
}

// Nouvelle interface pour les ventes réelles
export interface Transaction {
  id: string;
  title: string;
  brand: string;
  buyPrice: number;
  sellPrice: number;
  date: string; // ISO String YYYY-MM-DD
  platform: 'Vinted' | 'Depop' | 'Leboncoin' | 'Autre';
  imageUrl?: string; // Ajout de la photo
  notes?: string;
}

export interface SourcingOpportunity {
  itemName: string;
  brand: string;
  targetBuyPrice: string;
  estimatedResellPrice: string;
  potentialProfit: string;
  searchQuery: string;
  tips: string;
  liquidity?: 'Très Rapide' | 'Rapide' | 'Moyen' | 'Lent';
  difficulty: 'Facile' | 'Moyen' | 'Expert';
}

export const LoadingState = {
  IDLE: 'IDLE',
  ANALYZING: 'ANALYZING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
} as const;

export type LoadingState = typeof LoadingState[keyof typeof LoadingState];

export type AppView = 'selling' | 'sourcing' | 'accounting' | 'profile';

export interface UserPreferences {
  language: string;
  currency: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'fr',
  currency: 'EUR'
};