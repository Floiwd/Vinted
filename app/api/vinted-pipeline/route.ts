import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { appendSkuToTitle, ensureManualSizePrompt, normalizeRecognizedSize, sanitizeAdCopy } from "@/lib/ad-copy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 140;

let skuReservationQueue = Promise.resolve();

type PhotoInput = { dataUrl: string; angle: string };
type PipelineInput = {
  action?: string;
  stock?: unknown[];
  skuId?: string;
  fileName?: string;
  dataUrl?: string;
  photos?: PhotoInput[];
  prixAchat?: number | null;
  mode?: "SEMAINE_ACHAT" | "WEEKEND_SHOOTING";
};

function dataDirectory(userId: string) {
  return join(process.env.VINTED_DATA_DIR || join(process.cwd(), ".vinted-data"), userId);
}

async function readServerStock(userId: string) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await getSupabaseAdmin().from("vinted_stock").select("data")
      .like("sku_id", `${userId}:%`).eq("data->>owner_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Lecture Supabase impossible : ${error.message}`);
    return (data || []).map((row) => row.data) as unknown[];
  }
  try {
    return JSON.parse(await readFile(join(dataDirectory(userId), "stock.json"), "utf8")) as unknown[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeServerStock(stock: unknown[], userId: string) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const now = new Date().toISOString();
    const rows = stock.map((entry) => {
      const item = entry as Record<string, unknown>;
      if (typeof item.sku_id !== "string" || !/^(?:\d{3,9}|VTD-[A-Z0-9]{4,12})$/i.test(item.sku_id)) {
        throw new Error("SKU de stock invalide.");
      }
      const updatedAt = typeof item.updated_at === "string" ? item.updated_at : now;
      return { sku_id: `${userId}:${item.sku_id}`, data: { ...item, owner_id: userId, updated_at: updatedAt }, updated_at: updatedAt };
    });
    if (!rows.length) return;
    const { error } = await getSupabaseAdmin().from("vinted_stock").upsert(rows, { onConflict: "sku_id" });
    if (error) throw new Error(`Écriture Supabase impossible : ${error.message}`);
    return;
  }
  const directory = dataDirectory(userId);
  const filePath = join(directory, "stock.json");
  const temporaryPath = join(directory, `stock-${randomInt(1_000_000_000)}.tmp`);
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(stock, null, 2), "utf8");
  await rename(temporaryPath, filePath);
}

async function reserveServerSku(userId: string) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await getSupabaseAdmin().rpc("reserve_vinted_sku");
    if (error) throw new Error(`Réservation Supabase impossible : ${error.message}`);
    return String(data).padStart(3, "0");
  }
  let reservedSku = "";
  const reserve = async () => {
    const directory = dataDirectory(userId);
    await mkdir(directory, { recursive: true });
    const stock = await readServerStock(userId);
    const stockMaximum = stock.reduce<number>((maximum, entry) => {
      const sku = (entry as { sku_id?: unknown })?.sku_id;
      return typeof sku === "string" && /^\d{3,9}$/.test(sku) ? Math.max(maximum, Number(sku)) : maximum;
    }, 0);
    let savedMaximum = 0;
    try {
      savedMaximum = Number(await readFile(join(directory, "sku-counter"), "utf8")) || 0;
    } catch {
      savedMaximum = 0;
    }
    const next = Math.max(stockMaximum, savedMaximum) + 1;
    await writeFile(join(directory, "sku-counter"), String(next), "utf8");
    reservedSku = String(next).padStart(3, "0");
  };
  skuReservationQueue = skuReservationQueue.then(reserve, reserve);
  await skuReservationQueue;
  return reservedSku;
}

async function deleteServerStock(skuId: string, userId: string) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { error } = await getSupabaseAdmin().from("vinted_stock").delete()
      .eq("sku_id", `${userId}:${skuId}`).eq("data->>owner_id", userId);
    if (error) throw new Error(`Suppression Supabase impossible : ${error.message}`);
    return;
  }
  const stock = await readServerStock(userId);
  await writeServerStock(stock.filter((entry) => (entry as { sku_id?: string }).sku_id !== skuId), userId);
}

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers });
}

async function authenticateRequest(request: Request): Promise<{ userId?: string; status?: number }> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { status: 401 };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { status: 503 };
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return { status: 401 };
    return { userId: data.user.id };
  } catch {
    return { status: 503 };
  }
}

function nextPublicationSlot() {
  const zone = "Europe/Paris";
  const now = new Date();
  const weekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" });
  const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: zone, day: "2-digit", month: "short" });
  const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const slots = [
    { day: "Fri", hour: 19, minute: 0, label: "vendredi soir" },
    { day: "Sat", hour: 10, minute: 0, label: "samedi matin" },
    { day: "Sun", hour: 12, minute: 30, label: "dimanche midi" },
  ];

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const weekday = weekdayFormat.format(date);
    for (const slot of slots) {
      if (weekday !== slot.day) continue;
      const dateLabel = dateFormat.format(date);
      const sameDay = dateLabel === dateFormat.format(now);
      const [currentHour, currentMinute] = timeFormat.format(now).split(":").map(Number);
      if (sameDay && (currentHour > slot.hour || (currentHour === slot.hour && currentMinute >= slot.minute))) continue;
      return `${slot.label} · ${dateLabel} à ${String(slot.hour).padStart(2, "0")}h${String(slot.minute).padStart(2, "0")} (Paris)`;
    }
  }
  return "Prochain créneau vendredi soir";
}

async function omniRoute(model: string, messages: unknown[], options: { timeoutMs?: number; stage: string }) {
  const apiKey = process.env.OMNIROUTE_API_KEY;
  if (!apiKey) throw new Error("OMNIROUTE_API_KEY n'est pas configurée côté serveur.");
  const timeoutMs = options.timeoutMs ?? 45_000;
  const baseUrl = (process.env.OMNIROUTE_BASE_URL || "http://localhost:4000/v1").replace(/\/$/, "");
  const endpoint = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`}/chat/completions`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.4, response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError"
      ? `La requête a dépassé ${Math.round(timeoutMs / 1000)} secondes.`
      : "Vérifie que le serveur OmniRoute est démarré et joignable depuis Next.js.";
    throw new Error(`OmniRoute n'a pas terminé ${options.stage} (${endpoint}). ${reason}`);
  }
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  } | null;
  if (!response.ok) {
    const providerMessage = payload?.error?.message || `OmniRoute a répondu ${response.status}.`;
    if (/no active credentials/i.test(providerMessage)) {
      throw new Error(`Aucun accès fournisseur actif dans OmniRoute pour ${model}. Active un compte fournisseur ou choisis un modèle autorisé.`);
    }
    if (/exhausted their quota|quota.*exhaust/i.test(providerMessage)) {
      throw new Error(`Le quota est épuisé pour ${model}. Vérifie les comptes fournisseurs OmniRoute ou choisis un modèle disponible.`);
    }
    throw new Error(providerMessage);
  }
  const content = payload?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((part) => part.text || "").join("\n") : content;
  if (!text) throw new Error("Réponse IA vide.");
  return text;
}

async function vintedMarketSnapshot(item: { marque: string; modele: string; categorie: string; taille: string; etat?: string }) {
  const searchTerms = [item.marque, item.modele, item.categorie, item.taille]
    .filter((value) => Boolean(value) && !/^à renseigner/i.test(value))
    .join(" ");
  const fallback = { average: null, min: null, max: null, samples: [], count: 0, observed_at: new Date().toISOString(), source: "fallback" };
  if (!searchTerms.trim()) return fallback;

  const endpoint = `https://www.vinted.fr/api/v2/catalog/items?search_text=${encodeURIComponent(searchTerms)}&currency=EUR&status[]=active&per_page=8`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
        "Accept": "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) return fallback;
    const data = await response.json() as { items?: Array<{ price?: { amount?: number; currency?: string }; title?: string; brand_title?: string; size?: string; is_for_swap?: boolean }> };
    const prices = (data.items || [])
      .map((entry) => Number(entry?.price?.amount))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 8);

    if (!prices.length) return fallback;

    const avg = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    return {
      average: Number(avg.toFixed(2)),
      min: Number(Math.min(...prices).toFixed(2)),
      max: Number(Math.max(...prices).toFixed(2)),
      samples: prices.slice(0, 5),
      count: prices.length,
      observed_at: new Date().toISOString(),
      source: "vinted-live",
    };
  } catch {
    return fallback;
  }
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("La réponse IA n'est pas au format JSON attendu.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.userId) {
    const status = auth.status || 401;
    return json({ success: false, error: status === 503 ? "Supabase Auth n'est pas configuré côté serveur." : "Session Supabase invalide." }, status);
  }
  const userId = auth.userId;
  const url = new URL(request.url);
  if (url.searchParams.get("resource") === "stock") {
    try {
      return json({ success: true, stock: await readServerStock(userId) });
    } catch {
      return json({ success: false, error: "Lecture du stock central impossible." }, 500);
    }
  }
  const receiptSku = url.searchParams.get("receipt");
  if (receiptSku) {
    if (!/^(?:\d{3,6}|VTD-[A-Z0-9]{4,12})$/i.test(receiptSku)) return json({ success: false, error: "Référence invalide." }, 400);
    const extension = url.searchParams.get("ext");
    const contentTypes: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (!extension || !contentTypes[extension]) return json({ success: false, error: "Format de reçu invalide." }, 400);
    try {
      let receiptBytes: Uint8Array;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { data, error } = await getSupabaseAdmin().storage.from("purchase-receipts").download(`${userId}/${receiptSku}.${extension}`);
        if (error || !data) throw new Error("Reçu Supabase introuvable.");
        receiptBytes = new Uint8Array(await data.arrayBuffer());
      } else {
        receiptBytes = new Uint8Array(await readFile(join(dataDirectory(userId), "receipts", `${receiptSku}.${extension}`)));
      }
      const receiptBuffer = receiptBytes.buffer.slice(receiptBytes.byteOffset, receiptBytes.byteOffset + receiptBytes.byteLength) as ArrayBuffer;
      return new Response(receiptBuffer, { headers: { "Content-Type": contentTypes[extension], "Content-Disposition": "inline", "Cache-Control": "private, no-store" } });
    } catch {
      return json({ success: false, error: "Reçu introuvable." }, 404);
    }
  }
  return json({ success: true, userId });
}

export async function POST(request: Request) {
  let input: PipelineInput;
  try {
    input = await request.json() as PipelineInput;
  } catch {
    return json({ success: false, error: "Requête JSON invalide." }, 400);
  }

  const auth = await authenticateRequest(request);
  if (!auth.userId) {
    const status = auth.status || 401;
    return json({ success: false, error: status === 503 ? "Supabase Auth n'est pas configuré côté serveur." : "Session Supabase invalide." }, status);
  }
  const userId = auth.userId;

  if (input.action === "reserve-sku") {
    try {
      return json({ success: true, skuId: await reserveServerSku(userId) });
    } catch {
      return json({ success: false, error: "Réservation du SKU impossible." }, 500);
    }
  }

  if (input.action === "sync-stock") {
    if (!Array.isArray(input.stock) || input.stock.length > 5000) return json({ success: false, error: "Format de stock invalide." }, 400);
    const validItems = input.stock.every((item) => item && typeof item === "object" && typeof (item as { sku_id?: unknown }).sku_id === "string");
    if (!validItems || JSON.stringify(input.stock).length > 5_000_000) return json({ success: false, error: "Stock invalide ou trop volumineux." }, 400);
    try {
      await writeServerStock(input.stock, userId);
      return json({ success: true, count: input.stock.length });
    } catch {
      return json({ success: false, error: "Écriture du stock central impossible." }, 500);
    }
  }

  if (input.action === "delete-stock") {
    if (!/^(?:\d{3,9}|VTD-[A-Z0-9]{4,12})$/i.test(input.skuId || "")) return json({ success: false, error: "SKU invalide." }, 400);
    try {
      await deleteServerStock(input.skuId!, userId);
      return json({ success: true });
    } catch {
      return json({ success: false, error: "Suppression de l'article impossible." }, 500);
    }
  }

  if (input.action === "save-receipt") {
    if (!/^(?:\d{3,9}|VTD-[A-Z0-9]{4,12})$/i.test(input.skuId || "")) return json({ success: false, error: "SKU invalide." }, 400);
    const skuId = input.skuId!;
    const match = input.dataUrl?.match(/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[2].length > 12_000_000) return json({ success: false, error: "Format invalide ou fichier supérieur à 8 Mo." }, 400);
    const extension = match[1] === "application/pdf" ? "pdf" : match[1].split("/")[1] === "jpeg" ? "jpg" : match[1].split("/")[1];
    const filename = `${userId}/${skuId}.${extension}`;
    try {
      const receiptBytes = Buffer.from(match[2], "base64");
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { error } = await getSupabaseAdmin().storage.from("purchase-receipts").upload(filename, receiptBytes, { contentType: match[1], upsert: true });
        if (error) throw new Error(`Enregistrement Supabase impossible : ${error.message}`);
      } else {
        const directory = join(dataDirectory(userId), "receipts");
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, filename), receiptBytes);
      }
      return json({ success: true, receipt_name: String(input.fileName || filename).slice(0, 120), receipt_url: `/api/vinted-pipeline?receipt=${encodeURIComponent(skuId)}&ext=${extension}` });
    } catch {
      return json({ success: false, error: "Enregistrement du reçu impossible." }, 500);
    }
  }

  const photos = input.photos;
  if (!Array.isArray(photos) || photos.length < 3 || photos.length > 8) {
    return json({ success: false, error: "Ajoutez entre 3 et 8 photos, dont une vue globale, une étiquette et des détails." }, 400);
  }
  const totalBytes = photos.reduce((total, photo) => total + (photo?.dataUrl?.length ?? 0), 0);
  if (totalBytes > 26_000_000 || photos.some((photo) => !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo.dataUrl))) {
    return json({ success: false, error: "Images invalides ou trop volumineuses (26 Mo maximum au total)." }, 400);
  }
  if (input.prixAchat != null && (!Number.isFinite(input.prixAchat) || input.prixAchat < 0)) {
    return json({ success: false, error: "Le prix d'achat doit être un montant positif." }, 400);
  }

  try {
    const visionText = await omniRoute(process.env.GEMINI_MODEL || "gemini/gemini-2.5-flash", [
      {
        role: "system",
        content: "Tu es un assistant d'inventaire textile. Analyse chaque photo sans jamais certifier une authenticité à partir d'images seules. Signale les indices observables et les incertitudes. Pour la taille, lis uniquement une étiquette lisible; ne la déduis jamais de la coupe, du vêtement ou des proportions. Si aucune taille lisible n'apparaît, renvoie exactement 'À renseigner manuellement'. Lis les mesures uniquement si un mètre ruban est visible et ses graduations sont lisibles; sinon renvoie mesures null. Réponds en JSON strict avec marque, modele, categorie, taille, etat, caracteristiques (tableau), mesures (objet de mesures ou null), authenticite (niveau parmi faible/moyen/élevé et indices tableau), prix_achat_cible_eur (nombre), confiance (nombre 0-1). Pour le prix cible, estime un prix de sourcing prudent en euros et distingue-le d'une valeur de revente.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Analyse l'article sur ces ${photos.length} angles. Les fichiers sont dans l'ordre fourni; les libellés sont indiqués avant chaque photo. ${photos.map((photo) => photo.angle).join("; ")} ${input.prixAchat == null ? "Estime aussi un prix d'achat cible prudent." : `Prix d'achat fourni: ${input.prixAchat} EUR.`}` },
          ...photos.flatMap((photo) => [
            { type: "text", text: `Angle: ${photo.angle}` },
            { type: "image_url", image_url: { url: photo.dataUrl } },
          ]),
        ],
      },
    ], { timeoutMs: 80_000, stage: "l'analyse des photos" });
    const vision = parseJson<{
      marque?: string; modele?: string; categorie?: string; taille?: string; etat?: string;
      caracteristiques?: string[]; mesures?: Record<string, string | number> | null;
      authenticite?: { niveau?: string; indices?: string[] }; prix_achat_cible_eur?: number; confiance?: number;
    }>(visionText);

    const purchasePrice = input.prixAchat ?? Number(vision.prix_achat_cible_eur);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new Error("Le prix d'achat cible n'a pas pu être estimé. Saisissez-le manuellement.");
    const ctaTtc = Number((purchasePrice * 1.05 + 0.70 + 3.50).toFixed(2));
    const minimumPrice = Number((ctaTtc * 2).toFixed(2));
    const displayedPrice = Math.ceil(minimumPrice * 1.18);
    const item = {
      marque: vision.marque || "Marque à identifier",
      modele: vision.modele || "Modèle à préciser",
      categorie: vision.categorie || "Vêtement",
      taille: normalizeRecognizedSize(vision.taille),
      etat: vision.etat || "À vérifier",
      caracteristiques: Array.isArray(vision.caracteristiques) ? vision.caracteristiques : [],
      mesures: vision.mesures || null,
      authenticite: vision.authenticite || { niveau: "faible", indices: ["Vérification manuelle recommandée"] },
      confiance: Math.min(1, Math.max(0, Number(vision.confiance) || 0)),
    };
    const market = await vintedMarketSnapshot(item);
    const copyText = await omniRoute(process.env.CLAUDE_MODEL || "auto/claude-sonnet", [
      {
        role: "system",
        content: "Tu es un rédacteur Vinted premium. Tu produis des annonces factuelles, nettes et crédibles qui ressemblent à des ventes réelles de qualité, pas à des textes génériques. Réponds en JSON strict avec les clés titre_seo, description, hashtags, message_nego. Règles absolues : 1) titre_seo doit être court, précis, orienté SEO, avec marque, modèle, taille, coupe et couleur visibles; si la taille vaut 'À renseigner manuellement', écris 'Taille à renseigner' dans le titre et ne la remplace jamais par une taille supposée ; 2) la description doit être une annonce Vinted propre, lisible, en français, avec structure premium : '📝 Brand Model' puis 'Détails:' avec marque, modèle, taille, couleur, puis '✨ État:' avec 1-2 phrases concrètes, puis '💡 Pourquoi l'acheter:' avec un argument de valeur, puis éventuellement '🔎 Keywords:' ; si la taille vaut 'À renseigner manuellement', conserve exactement cette mention dans les détails ; 3) évite les phrases vagues, les superlatifs non vérifiables, les promesses de contournement de modération et les généralisations sans valeur ; 4) si une info manque, dis-le clairement sans l'inventer ; 5) hashtags = 5 à 8 tags très ciblés, réalistes, en français et/ou anglais, sans spam ; 6) message_nego = court, élégant, confiant, sans pression, sans parler d'achat revente, sans mention 'je vends vite', 'promo', 'cash' ou 'je peux baisser' ; 7) utilise le marché observé pour ajuster le prix et le positionnement, sans inventer des ventes non observées. Le titre et la description doivent avoir l'allure d'une vraie annonce Vinted premium, pas un texte de chatgpt minimaliste.",
      },
      {
        role: "user",
        content: JSON.stringify({
          article: item,
          prixAchat: purchasePrice,
          prixAffiche: displayedPrice,
          mode: input.mode || "SEMAINE_ACHAT",
          market,
          consignes: {
            objectif: "Produire un titre SEO premium et une description Vinted très proche du style attendu dans les meilleures annonces",
            style: "naturel, premium, crédible, lisible, orienté achat",
            format: "titre_seo, description, hashtags, message_nego",
            structure_description: ["📝 Titre de l'article", "Détails:", "✨ État:", "💡 Pourquoi l'acheter:", "🔎 Keywords:", "#hashtags"],
            prohibe: ["invention", "superlatif non vérifiable", "vente flash", "achat revente", "pression", "hashtags spammés"],
            cible: "titre et description réalistes, de qualité, directement exploitables sur Vinted"
          }
        })
      },
    ], { timeoutMs: 45_000, stage: "la rédaction de l'annonce" });
      const rawCopy = parseJson<{ titre_seo?: string; description?: string; hashtags?: string; message_nego?: string }>(copyText);
    const copy = sanitizeAdCopy(rawCopy);
    const skuId = /^\d{3,6}$/.test(input.skuId || "") ? input.skuId! : String(randomInt(1, 1_000_000)).padStart(3, "0");
    const missingSize = item.taille === "À renseigner manuellement";
    const title = missingSize && !/taille à renseigner/i.test(copy.titre_seo)
      ? `${copy.titre_seo} Taille à renseigner`
      : copy.titre_seo;
    const description = missingSize ? ensureManualSizePrompt(copy.description) : copy.description;
    const pricing = {
      prix_affiche: displayedPrice,
      prix_revente: Number(Math.max(displayedPrice, purchasePrice * 1.8 + 8).toFixed(2)),
    };
    const data = {
      SKU_ID: skuId,
      sku_id: skuId,
      ...item,
      prix_achat: purchasePrice,
      cta_ttc: ctaTtc,
      prix_min_x2: minimumPrice,
      prix_affiche: pricing.prix_affiche,
      prix_revente: pricing.prix_revente,
      marge_negociation_pct: 18,
      creneau_publi: nextPublicationSlot(),
      created_at: new Date().toISOString(),
      statut: "A_COMPLETER",
      checklist: { size: false, condition: false, material: false, photos: false, authenticity: false },
      titre_seo: appendSkuToTitle(title || `${item.marque} ${item.modele} ${item.categorie} ${item.taille}`, skuId),
      description: description || "Vêtement en bon état, à découvrir et à essayer.",
      market,
      hashtags: copy.hashtags || "#secondemain #mode #vintage #look #streetwear #style #pull #boutique",
      message_nego: input.mode === "WEEKEND_SHOOTING" ? "" : copy.message_nego || "",
      sync_sheet: false,
    };

    const webhook = process.env.STOCK_PIPELINE;
    if (webhook) {
      try {
        const syncResponse = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(12_000),
        });
        data.sync_sheet = syncResponse.ok;
      } catch {
        data.sync_sheet = false;
      }
    }
    return json({ success: true, data, warning: webhook && !data.sync_sheet ? "Article généré, mais la synchronisation Google Sheets a échoué." : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue du pipeline.";
    return json({ success: false, error: message }, 502);
  }
}