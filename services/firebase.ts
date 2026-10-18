import { HistoryItem, Transaction } from "../types";
import { db } from "../firebaseConfig";
import { collection, query, orderBy, getDocs, addDoc, deleteDoc, doc, updateDoc, limit, setDoc, getDoc } from "firebase/firestore";
import { UserPreferences, DEFAULT_PREFERENCES } from "../types";

// SERVICE CLOUD FIRESTORE
export const StorageService = {

  // --- HISTORIQUE DE SCAN ---

  async saveItem(userId: string | null, item: HistoryItem): Promise<void> {
    if (!userId) return; // Sécurité: pas de sauvegarde si pas connecté
    try {
      const colRef = collection(db, "users", userId, "history");
      // Ajout en base
      await addDoc(colRef, { ...item, timestamp: Date.now() });
      // Note: On pourrait implémenter une cloud function pour nettoyer les vieux items
      // Mais ici on laisse Firebase gérer le volume
    } catch (e) {
      console.warn("Erreur Firestore saveItem:", e);
    }
  },

  async getHistory(userId: string | null): Promise<HistoryItem[]> {
    if (!userId) return [];
    try {
      const colRef = collection(db, "users", userId, "history");
      const q = query(colRef, orderBy("timestamp", "desc"), limit(50));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as HistoryItem));
    } catch (e) {
      console.error("Erreur Firestore getHistory:", e);
      return [];
    }
  },

  async deleteItem(userId: string | null, itemId: string): Promise<void> {
    if (!userId) return;
    try {
      // Attention: itemId doit être l'ID du document Firestore, pas juste un ID local
      // Dans notre app actuelle, l'ID local était généré par crypto.randomUUID()
      // Il faudra s'assurer que l'ID utilisé pour la suppression est bien l'ID du doc
      const docRef = doc(db, "users", userId, "history", itemId);
      await deleteDoc(docRef);
    } catch (e) {
      console.error("Erreur Firestore deleteItem:", e);
    }
  },

  // --- GESTION DES TRANSACTIONS (BUSINESS) ---

  async saveTransaction(userId: string | null, transaction: Transaction): Promise<void> {
    if (!userId) return;
    try {
      const colRef = collection(db, "users", userId, "transactions");

      // Si la transaction a déjà un ID qui correspond à un doc existant, on update
      // MAIS: Dans cette version simple, "saveTransaction" est appelé pour UPDATE et CREATE.
      // Si on a un ID et qu'on pense qu'il existe, on update.
      // Pour simplifier la migration: on utilise setDoc ou updateDoc si l'ID existe

      // Stratégie: 
      // Si c'est une création, l'ID est nouveau (généré par le client).
      // Firestore peut générer ses propres IDs, mais on peut forcer l'ID du client.
      // Utilisons setDoc pour forcer l'ID et écraser si existant (Update/Create unifié)
      const { setDoc } = await import("firebase/firestore"); // Import dynamique pour éviter surcharge imports
      const docRef = doc(db, "users", userId, "transactions", transaction.id);
      await setDoc(docRef, transaction);

    } catch (e) {
      console.error("Erreur Firestore saveTransaction:", e);
    }
  },

  async getTransactions(userId: string | null): Promise<Transaction[]> {
    if (!userId) return [];
    try {
      const colRef = collection(db, "users", userId, "transactions");
      const q = query(colRef, orderBy("date", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as Transaction);
    } catch (e) {
      console.error("Erreur Firestore getTransactions:", e);
      return [];
    }
  },

  async deleteTransaction(userId: string | null, id: string): Promise<void> {
    if (!userId) return;
    try {
      const docRef = doc(db, "users", userId, "transactions", id);
      await deleteDoc(docRef);
    } catch (e) {
      console.error("Erreur Firestore deleteTransaction:", e);
    }
  },

  // Utilitaires
  clearAllData() {
    // Non implémenté pour Cloud
    console.log("Clear data not supported in cloud mode via client");
  },

  // --- PREFERENCES UTILISATEUR ---

  async savePreferences(userId: string | null, prefs: UserPreferences): Promise<void> {
    if (!userId) return;
    try {
      const docRef = doc(db, "users", userId);
      // On utilise setDoc avec merge: true pour ne pas écraser d'autres champs potentiels
      await setDoc(docRef, { preferences: prefs }, { merge: true });
    } catch (e) {
      console.error("Erreur Firestore savePreferences:", e);
    }
  },

  async getPreferences(userId: string | null): Promise<UserPreferences> {
    if (!userId) return DEFAULT_PREFERENCES;
    try {
      const docRef = doc(db, "users", userId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists() && snapshot.data().preferences) {
        return snapshot.data().preferences as UserPreferences;
      }
      return DEFAULT_PREFERENCES;
    } catch (e) {
      console.error("Erreur Firestore getPreferences:", e);
      return DEFAULT_PREFERENCES;
    }
  }
};