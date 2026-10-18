// Service pour récupérer les données d'une annonce Vinted via l'API serverless

export interface VintedItemData {
    title: string;
    price: string;
    brand: string;
    imageUrl: string;
    size?: string;
    condition?: string;
    date?: string;
}

/**
 * Extrait les données d'une annonce Vinted via l'API serverless
 * @param vintedUrl - URL complète de l'annonce Vinted (ex: https://www.vinted.fr/items/123456-titre)
 */
export const fetchVintedData = async (vintedUrl: string): Promise<VintedItemData> => {
    // Validation de l'URL
    if (!vintedUrl.includes('vinted.') || !vintedUrl.includes('/items/')) {
        throw new Error('URL invalide. Utilisez une URL Vinted au format: https://www.vinted.fr/items/...');
    }

    try {
        // Appel à notre API serverless
        const apiUrl = `/api/vinted-scraper?url=${encodeURIComponent(vintedUrl)}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
        }

        const data: VintedItemData = await response.json();

        // Vérifier qu'on a au moins le titre
        if (!data.title) {
            throw new Error('Impossible d\'extraire les données de cette annonce');
        }

        return data;
    } catch (error: any) {
        console.error('[Vinted Service] Erreur:', error);
        throw new Error(error.message || 'Erreur lors de l\'import Vinted');
    }
};

/**
 * Extrait l'ID de l'annonce depuis l'URL Vinted
 * @param vintedUrl - URL Vinted
 * @returns ID de l'annonce ou null
 */
export const extractVintedId = (vintedUrl: string): string | null => {
    const match = vintedUrl.match(/\/items\/(\d+)/);
    return match ? match[1] : null;
};
