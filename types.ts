
export interface DefectItem {
  type: string;       // ex: "Tache", "Trou", "Bouloches", "Décoloration"
  location: string;   // ex: "Sur la manche gauche", "Près du col"
  confidence: number; // Score 0-100
}

export interface ListingData {
  title: string;
  description: string;
  estimatedPrice: string;
  brand: string;
  size: string;
  condition: string;
  category: string; // [NEW] Type/Catégorie
  colors: string[];
  defects?: DefectItem[];
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

export enum LoadingState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type AppView = 'selling' | 'sourcing' | 'accounting' | 'profile';

export interface UserPreferences {
  language: string;
  currency: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'fr',
  currency: 'EUR'
};