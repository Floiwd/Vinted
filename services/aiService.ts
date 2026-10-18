/// <reference types="vite/client" />
import OpenAI from "openai";
import { ListingData, SourcingOpportunity, Transaction } from "../types";

const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || "";
const siteUrl = import.meta.env.VITE_SITE_URL || "http://localhost:5173";
const siteName = import.meta.env.VITE_SITE_NAME || "Vinted Assistant";

let openaiClient: OpenAI | null = null;

const getOpenAIClient = () => {
    if (openaiClient) return openaiClient;

    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || "";
    // On ne crash pas si la clé est vide ici, on laissera l'appel échouer plus tard avec une erreur claire

    openaiClient = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        dangerouslyAllowBrowser: true,
        defaultHeaders: {
            "HTTP-Referer": siteUrl,
            "X-Title": siteName,
        },
    });
    return openaiClient;
};

/**
 * Nettoie une chaîne JSON des caractères de contrôle invalides
 * (sauts de ligne, tabulations, etc. à l'intérieur des strings)
 */
const sanitizeJSON = (jsonString: string): string => {
    // Supprimer les balises markdown
    let cleaned = jsonString.trim();
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/i, "");

    // Remplacer TOUS les caractères de contrôle (ASCII 0-31) sauf ceux déjà échappés
    // Cette approche est plus robuste que le regex sur les quotes
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        const charCode = char.charCodeAt(0);

        if (escaped) {
            result += char;
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            result += char;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            result += char;
            continue;
        }

        // Si on est dans une string et qu'on trouve un caractère de contrôle
        if (inString && charCode < 32) {
            // Remplacer par la séquence d'échappement appropriée
            if (charCode === 10) { // \n
                result += '\\n';
            } else if (charCode === 13) { // \r
                result += '\\r';
            } else if (charCode === 9) { // \t
                result += '\\t';
            } else {
                // Autres caractères de contrôle: les supprimer ou les remplacer par un espace
                result += ' ';
            }
        } else {
            result += char;
        }
    }

    return result;
};


export const analyzeClothingImage = async (base64Images: string[]): Promise<ListingData> => {
    try {
        const messages: any[] = [
            {
                role: "system",
                content: `Tu es un VENDEUR PRO VINTED expérimenté qui génère +1000€/mois.
        
        STYLE DE DESCRIPTION PRO VINTED :
        - Commence par un emoji accrocheur + phrase d'accroche vendeuse
        - Utilise des emojis stratégiques (✨ 👗 🏷️ 📏 💫 🔥)
        - Fais des lignes COURTES (max 5-6 mots par ligne)
        - SAUTE une ligne entre chaque info
        - Structure : Accroche → Marque → Taille → État → Détails → Hashtags
        
        EXEMPLE DE BONNE DESCRIPTION :
        "✨ Pièce vintage rare !

        🏷️ Marque : Stüssy
        📏 Taille : L (taille normale)
        
        💫 État : Très bon état
        Aucun défaut, porté quelques fois
        
        🔥 Idéal pour un look streetwear
        
        Envoi rapide et soigné 📦
        
        #stussy #vintage #streetwear..."
        
        CRUCIAL - HASHTAGS :
        - Ajoute une liste de 10 hashtags à la fin de la description.
        
        CRUCIAL - PRIX VINTED (DONNÉES MARCHÉ RÉELLES 2024) :
        Basé sur l'analyse des prix réels sur Vinted.fr :
        
        SWEATS/HOODIES :
        - Stussy basique : 40-55€
        - Stussy rare/vintage : 70-120€
        - Carhartt WIP : 25-45€
        - Nike/Adidas vintage : 25-40€
        - Nike 90's rare (logo brodé) : 50-70€
        
        AUTRES :
        - Jean Levi's 501 vintage : 30-50€
        - Jean Carhartt : 25-40€
        - T-shirt de marque : 12-25€
        - Veste workwear Carhartt : 50-80€
        - Bomber vintage : 40-70€
        
        RÈGLES :
        - Prix estimatedPrice = prix de vente rapide (milieu de fourchette)
        - minPrice = prix négocié (-15%)
        - maxPrice = prix si pièce rare/parfait état
        - +15% si état "Neuf avec étiquettes"
        
        CRUCIAL - FORMAT JSON OBLIGATOIRE :
        Tu DOIS retourner un JSON avec EXACTEMENT ces champs :
        {
          "title": "Titre optimisé pour Vinted",
          "description": "Description vendeuse avec emojis. IMPORTANT: Dans le JSON, utilise \\n pour les sauts de ligne (pas de vrais retours à la ligne). Termine par 10 hashtags.",
          "estimatedPrice": "25",
          "minPrice": "20",
          "maxPrice": "30",
          "brand": "Nom de la marque",
          "size": "Taille (S, M, L, 38, etc.)",
          "category": "Type de vêtement (Pull, Jean, Veste, etc.)",
          "condition": "État (Neuf, Très bon état, Bon état, etc.)",
          "colors": ["couleur1", "couleur2"],
          "authenticity": {
            "status": "Authentique ou Suspect ou Incertain",
            "confidence": 85,
            "reason": "Explication de ton analyse d'authenticité"
          }
        }
        
        TOUS les champs sont OBLIGATOIRES. Ne retourne QUE du JSON valide.`
            },
            {
                role: "user",
                content: [
                    { type: "text", text: "Analyse ces photos pour créer une annonce Vinted optimisée. Retourne le JSON complet avec tous les champs demandés." },
                    ...base64Images.map(img => ({
                        type: "image_url",
                        image_url: {
                            url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`
                        }
                    }))
                ]
            }
        ];

        const client = getOpenAIClient();
        const completion = await client.chat.completions.create({
            model: "google/gemini-2.0-flash-001", // Gemini Flash (Vision)
            messages: messages,
            response_format: { type: "json_object" }
        });

        const text = completion.choices[0].message.content || "";
        console.log("[AI Analysis] Raw response:", text);
        if (!text) throw new Error("Réponse vide de l'IA.");

        // Nettoyer et parser le JSON
        const cleanedText = sanitizeJSON(text);
        console.log("[AI Analysis] Cleaned JSON:", cleanedText);

        try {
            return JSON.parse(cleanedText) as ListingData;
        } catch (parseError) {
            console.error("[AI Analysis] JSON parse error:", parseError);
            throw new Error("Erreur de format de réponse. Réessayez.");
        }

    } catch (error: any) {
        console.error("AI Analysis Error:", error);
        throw new Error("Erreur IA: " + (error.message || "Erreur inconnue"));
    }
};

export const generateSourcingAdvice = async (minBudget: number, maxBudget: number, category: string): Promise<SourcingOpportunity[]> => {
    // Vérifier la clé API
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("Clé API OpenRouter manquante. Configurez VITE_OPENROUTER_API_KEY.");
    }

    try {
        const client = getOpenAIClient();
        console.log("[Sourcing IA] Génération des opportunités...", { minBudget, maxBudget, category });

        const completion = await client.chat.completions.create({
            model: "google/gemini-2.0-flash-001", // Gemini Flash - beaucoup plus rapide
            messages: [
                {
                    role: "system",
                    content: `Tu es un Expert Sourcer Vinted. Trouve 5 opportunités d'achat-revente précises.

RÈGLES:
- Sois précis: "Nike Sweat Vintage 90s Gris Tag Blanc" pas juste "Nike"
- Donne la requête Vinted exacte à copier
- Estime prix achat, revente, profit
- Donne un conseil rapide

JSON OBLIGATOIRE:
{
  "opportunities": [
    {
      "itemName": "Nom précis",
      "brand": "Marque",
      "targetBuyPrice": "15",
      "estimatedResellPrice": "35",
      "potentialProfit": "20",
      "searchQuery": "requête vinted",
      "tips": "Conseil court",
      "liquidity": "Rapide",
      "difficulty": "Facile"
    }
  ]
}`
                },
                {
                    role: "user",
                    content: `Budget: ${minBudget}-${maxBudget}€. Catégorie: ${category}. Génère 5 opportunités.`
                }
            ],
            response_format: { type: "json_object" }
        });

        const text = completion?.choices?.[0]?.message?.content || "";
        console.log("[Sourcing IA] Réponse brute:", text);

        if (!text) {
            throw new Error("Réponse vide de l'IA");
        }

        // Nettoyer et parser le JSON
        const cleanedText = sanitizeJSON(text);
        console.log("[Sourcing IA] JSON nettoyé:", cleanedText);

        try {
            const data = JSON.parse(cleanedText);
            const opportunities = data.opportunities || data.results || [];
            console.log("[Sourcing IA] Opportunités parsées:", opportunities.length);
            return opportunities;
        } catch (parseError) {
            console.error("[Sourcing IA] Erreur parsing JSON:", parseError, "Texte:", cleanedText);
            throw new Error("Erreur de format de réponse IA. Réessayez.");
        }
    } catch (error: any) {
        console.error("[Sourcing IA] Erreur:", error);

        // Messages d'erreur plus clairs
        if (error.status === 429) {
            throw new Error("Limite API atteinte. Ajoutez des crédits OpenRouter ou attendez.");
        }
        if (error.status === 401) {
            throw new Error("Clé API invalide. Vérifiez VITE_OPENROUTER_API_KEY.");
        }
        if (error.message?.includes("parsing")) {
            throw error;
        }

        throw new Error("Erreur Sourcing: " + (error.message || "Erreur inconnue"));
    }
};

export const analyzeBusinessStats = async (transactions: Transaction[]): Promise<string> => {
    if (transactions.length === 0) return "Aucune vente à analyser.";
    try {
        const summary = transactions.map(t => `- ${t.title}: Acheté ${t.buyPrice}, Vendu ${t.sellPrice}`).join("\n");

        const client = getOpenAIClient();
        const completion = await client.chat.completions.create({
            model: "deepseek/deepseek-chat", // DeepSeek V3
            messages: [
                { role: "system", content: "Tu es un Coach Business Vinted expert. Analyse ces chiffres et donne des conseils stratégiques pour augmenter la rentabilité." },
                { role: "user", content: `Voici mes ventes récentes :\n${summary}` }
            ]
        });

        return completion.choices[0].message.content || "Analyse impossible.";
    } catch (e) {
        return "Erreur lors de l'analyse.";
    }
};

export interface LevisModel {
    model: string;
    description: string;
    buyPrice: string;
    sellPrice: string;
    profit: string;
    difficulty: 'Facile' | 'Moyen' | 'Expert';
    liquidity: 'Très Rapide' | 'Rapide' | 'Moyen' | 'Lent';
    searchQuery: string;
    tips: string;
}


export const getLevisAnalysis = async (): Promise<LevisModel[]> => {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("Clé API OpenRouter manquante.");
    }

    try {
        const client = getOpenAIClient();
        console.log("[Levis IA] Génération de l'analyse...");

        const completion = await client.chat.completions.create({
            model: "google/gemini-2.0-flash-001", // Gemini Flash - plus rapide
            messages: [
                {
                    role: "system",
                    content: `Analyse les meilleurs jeans Levi's pour le resell sur Vinted.

MODÈLES: 501, 505, 517, 550, 560, Silvertab, Orange Tab

JSON OBLIGATOIRE:
{
  "models": [
    {
      "model": "501 Vintage USA",
      "description": "Classique très demandé",
      "buyPrice": "15-25",
      "sellPrice": "45-70",
      "profit": "25-50",
      "difficulty": "Moyen",
      "liquidity": "Rapide",
      "searchQuery": "levi's 501 vintage",
      "tips": "Cherchez Made in USA"
    }
  ]
}`
                },
                {
                    role: "user",
                    content: "Liste les 6 meilleurs modèles Levi's pour le resell."
                }
            ],
            response_format: { type: "json_object" }
        });

        const text = completion?.choices?.[0]?.message?.content || "";
        console.log("[Levis IA] Réponse:", text);

        if (!text) {
            throw new Error("Réponse vide de l'IA");
        }

        const cleanedText = sanitizeJSON(text);

        try {
            const data = JSON.parse(cleanedText);
            return data.models || [];
        } catch (parseError) {
            console.error("[Levis IA] Erreur parsing JSON:", parseError);
            throw new Error("Erreur de format de réponse IA. Réessayez.");
        }
    } catch (error: any) {
        console.error("[Levis IA] Erreur:", error);
        throw new Error("Erreur analyse Levi's: " + (error.message || "Erreur inconnue"));
    }
};

export const getRalphLaurenAnalysis = async (): Promise<LevisModel[]> => {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("Clé API OpenRouter manquante.");
    }

    try {
        const client = getOpenAIClient();
        console.log("[Ralph Lauren IA] Génération de l'analyse...");

        const completion = await client.chat.completions.create({
            model: "google/gemini-2.0-flash-001",
            messages: [
                {
                    role: "system",
                    content: `Analyse les meilleures pièces Ralph Lauren pour le resell sur Vinted.

CIBLES: Pull Maille Torsadée, Harrington, Polos Vintage, Chemises, Ligne RRL, Purple Label.

JSON OBLIGATOIRE:
{
  "models": [
    {
      "model": "Pull Torsadé (Cable Knit)",
      "description": "Le best-seller absolu.",
      "buyPrice": "15-25",
      "sellPrice": "40-60",
      "profit": "25-35",
      "difficulty": "Facile",
      "liquidity": "Très Rapide",
      "searchQuery": "ralph lauren pull torsadé",
      "tips": "Beige et couleurs pastels partent très vite."
    }
  ]
}`
                },
                {
                    role: "user",
                    content: "Liste les 6 meilleures pièces Ralph Lauren pour le resell (incluant pull, veste, chemise)."
                }
            ],
            response_format: { type: "json_object" }
        });

        const text = completion?.choices?.[0]?.message?.content || "";
        console.log("[Ralph Lauren IA] Réponse:", text);

        if (!text) {
            throw new Error("Réponse vide de l'IA");
        }

        const cleanedText = sanitizeJSON(text);

        try {
            const data = JSON.parse(cleanedText);
            return data.models || [];
        } catch (parseError) {
            console.error("[Ralph Lauren IA] Erreur parsing JSON:", parseError);
            throw new Error("Erreur de format de réponse IA. Réessayez.");
        }
    } catch (error: any) {
        console.error("[Ralph Lauren IA] Erreur:", error);
        throw new Error("Erreur analyse Ralph Lauren: " + (error.message || "Erreur inconnue"));
    }
};

