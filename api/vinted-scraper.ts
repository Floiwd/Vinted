import type { VercelRequest, VercelResponse } from '@vercel/node';

interface VintedItemData {
    title: string;
    price: string;
    brand: string;
    imageUrl: string;
    size?: string;
    condition?: string;
    date?: string; // Date de mise en vente ou de vente
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url } = req.query;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL Vinted requise' });
    }

    // Validate Vinted URL
    if (!url.includes('vinted.') || !url.includes('/items/')) {
        return res.status(400).json({ error: 'URL Vinted invalide. Format: https://www.vinted.fr/items/123456789-titre' });
    }

    try {
        // Fetch the Vinted page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            }
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }

        const html = await response.text();

        // Extract data from HTML using regex (no DOM parser on server)
        const data: VintedItemData = {
            title: '',
            price: '',
            brand: '',
            imageUrl: '',
        };

        // Extract title from og:title or title tag
        const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
            || html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
            data.title = titleMatch[1].replace(' | Vinted', '').trim();
        }

        // 1. EXTRACT PRICE
        // Try multiple patterns, ordered by reliability
        const priceRegexes = [
            // User identified pattern
            /class="[^"]*web_ui__Text__subtitle[^"]*"[^>]*>\s*([\d,\.]+)\s*&nbsp;€/s,
            /class="[^"]*web_ui__Text__subtitle[^"]*"[^>]*>\s*([\d,\.]+)\s*€/s,

            // Standard data patterns
            /"total_item_price":\s*{\s*"amount":\s*"([\d\.]+)"/,       // JSON
            /"price_numeric":\s*([\d\.]+)/,                            // JSON numeric
            /property="product:price:amount" content="([\d\.]+)"/,      // Meta
            /property="og:price:amount" content="([\d\.]+)"/,           // Meta OG
            /"amount":\s*"([\d\.]+)"/,                                  // Generic Amount
            /content="([\d\.]+)"[^>]*property="og:price:amount"/       // Meta variant
        ];

        for (const regex of priceRegexes) {
            const match = html.match(regex);
            if (match && match[1]) {
                data.price = match[1].replace(',', '.');
                break;
            }
        }

        // If still no price, check for explicit JSON in script tags manually if regex failed
        if (!data.price) {
            // Sometimes regex on full HTML fails if JSON is messy, let's try to find the specific block
            const scriptMatch = html.match(/<script[^>]*>.*?total_item_price.*?<\/script>/s);
            if (scriptMatch) {
                const inner = scriptMatch[0];
                const pMatch = inner.match(/"amount":\s*"([\d\.]+)"/);
                if (pMatch) {
                    data.price = pMatch[1];
                }
            }
        }

        // REMOVED: Generic fallback that searched for any "X,XX €" string
        // This was causing "random price" issues by picking up suggested items prices.
        // It is better to return 0/empty than a wrong price.

        // 2. EXTRACT BRAND
        const brandRegexes = [
            // User identified pattern
            /<span itemprop="name">([^<]+)<\/span>/i,

            // Standard patterns
            /"brand_title"\s*:\s*"([^"]+)"/,
            /"brand"\s*:\s*{\s*"title"\s*:\s*"([^"]+)"/,
            /itemprop="brand"[^>]*>([^<]+)</,
            /itemprop="name"[^>]*>([^<]+)</,  // Often brand is here in schema
        ];

        for (const regex of brandRegexes) {
            const match = html.match(regex);
            if (match && match[1]) {
                data.brand = match[1].trim();
                break;
            }
        }

        // 3. EXTRACT IMAGE
        const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (imageMatch) {
            data.imageUrl = imageMatch[1];
        }

        // If no brand found, try to extract from title (often format: "Article - BRAND")
        if (!data.brand && data.title) {
            const titleBrandMatch = data.title.match(/[-–]\s*([A-Z][A-Za-z&\s]+)$/);
            if (titleBrandMatch) {
                data.brand = titleBrandMatch[1].trim();
            }
        }

        // Extract condition if available
        const conditionMatch = html.match(/"status":\s*"([^"]+)"/i);
        if (conditionMatch) {
            data.condition = conditionMatch[1];
        }

        // 4. DATE
        // Vinted doesn't always expose exact date in HTML, mostly relative "Il y a ..."
        // We try to find a timestamp in JSON if possible
        const dateMatch = html.match(/"created_at_ts"\s*:\s*(\d+)/)
            || html.match(/"updated_at_ts"\s*:\s*(\d+)/);

        if (dateMatch && dateMatch[1]) {
            // Convert timestamp to YYYY-MM-DD
            data.date = new Date(parseInt(dateMatch[1]) * 1000).toISOString().split('T')[0];
        } else {
            // Default to today
            data.date = new Date().toISOString().split('T')[0];
        }

        return res.status(200).json(data);

    } catch (error: any) {
        console.error('[Vinted Scraper] Error:', error);
        return res.status(500).json({
            error: 'Impossible de récupérer les données Vinted',
            details: error.message
        });
    }
}
