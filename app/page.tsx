"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Cropper from "react-easy-crop";
import type { Html5Qrcode as Html5QrcodeInstance } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import "react-easy-crop/react-easy-crop.css";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { AiProviderType, AiStatusSummary } from "@/lib/ai-provider";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, Barcode, Box, CalendarDays, Check, CheckCircle2, Clipboard, Clock3,
  Command, Copy, ExternalLink, Eye, FileText, Flame, ImagePlus, LockKeyhole, LogOut, Mail, MailCheck, MapPin,
  MessageSquare, PackageCheck, Plus, Printer, RefreshCw, RotateCcw, ScanLine, Search, Send, ShieldAlert,
  ShieldCheck, Sliders, Sparkles, Sun, Tag, TrendingUp, Upload, Wallet, Wand2, Wifi, WifiOff, X, Zap,
} from "lucide-react";

const AI_PROVIDERS: Record<AiProviderType, { label: string; desc: string; keyUrl?: string; placeholder?: string }> = {
  auto: {
    label: "Automatique (Cloud ou Serveur)",
    desc: "Utilise en priorité les clés configurées sur le serveur (GEMINI_API_KEY, OPENROUTER_API_KEY, etc.) ou votre clé de compte.",
  },
  gemini: {
    label: "Google Gemini Cloud (Gratuit / Recommandé)",
    desc: "Vision native ultra-rapide (Gemini 2.0 Flash). Clé gratuite disponible en 1 clic sur Google AI Studio.",
    keyUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIzaSyC_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  openrouter: {
    label: "OpenRouter Cloud",
    desc: "Agrégateur multi-modèles (Gemini, Claude 3.5 Sonnet, GPT-4o-mini).",
    keyUrl: "https://openrouter.ai/keys",
    placeholder: "sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  openai: {
    label: "OpenAI Cloud (GPT-4o / GPT-4o-mini)",
    desc: "Modèles GPT officiels avec support vision.",
    keyUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  groq: {
    label: "Groq Cloud (Llama Vision)",
    desc: "Inférence Llama ultra-rapide pour la vision et le texte.",
    keyUrl: "https://console.groq.com/keys",
    placeholder: "gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  anthropic: {
    label: "Anthropic Claude Cloud",
    desc: "Claude 3.5 Sonnet pour la rédaction haut de gamme.",
    keyUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  omniroute: {
    label: "OmniRoute (Proxy / Serveur perso)",
    desc: "Pour connecter votre propre instance OmniRoute (locale ou distante via URL publique).",
    placeholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
};

type Mode = "SEMAINE_ACHAT" | "WEEKEND_SHOOTING" | "SOURCING_CAPTURE";
type Status = "EN_TRANSIT" | "A_COMPLETER" | "PRET_A_PUBLIER" | "EN_LIGNE" | "VENDU";
type Photo = { dataUrl: string; angle: string; name: string };
type Checklist = { size: boolean; condition: boolean; material: boolean; photos: boolean; authenticity: boolean };
type MarketSnapshot = { average: number | null; min: number | null; max: number | null; count: number; observed_at: string; source: string };
type ShippingLabel = { id: string; name: string; image: string; crop: { x: number; y: number }; zoom: number; cropArea: { x: number; y: number; width: number; height: number } | null };
type MarketVerdict = {
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
};

type SourcingAnalysis = {
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
};

type Listing = {
  sku_id: string; marque: string; modele: string; categorie: string; taille: string; etat: string;
  caracteristiques: string[]; mesures: Record<string, string | number> | null;
  authenticite: { niveau: string; indices: string[] }; confiance: number; prix_achat: number;
  cta_ttc: number; prix_min_x2: number; prix_affiche: number; prix_revente: number; marge_negociation_pct: number;
  creneau_publi: string; created_at?: string; statut: Status; titre_seo: string; titre_court?: string; description: string; hashtags: string;
  message_nego: string; sync_sheet: boolean; prix_vendu?: number; frais_reels?: number;
  checklist?: Checklist; market?: MarketSnapshot; market_verdict?: MarketVerdict;
  sourcing_analysis?: SourcingAnalysis;
  defauts_observes?: string[]; defauts_transparence?: string;
  date_publication?: string; date_vente?: string;
  emplacement?: string; fournisseur?: string; date_achat?: string; date_limite_retour?: string;
  justificatif_nom?: string; justificatif_url?: string; updated_at?: string;
};

const HISTORY_KEY = "vinted-coo-stock-v1";
function localHistoryKey(userId: string) {
  return `${HISTORY_KEY}:${userId}`;
}

function readLocalHistory(userId: string): Listing[] {
  try {
    const accountKey = localHistoryKey(userId);
    let raw = localStorage.getItem(accountKey);
    if (raw === null) {
      raw = localStorage.getItem(HISTORY_KEY);
      if (raw !== null) {
        localStorage.setItem(accountKey, raw);
        localStorage.removeItem(HISTORY_KEY);
      }
    }
    const stored = JSON.parse(raw || "[]") as Listing[];
    if (!Array.isArray(stored)) return [];
    return stored.map((entry) => entry.checklist ? entry : {
      ...entry,
      checklist: emptyChecklist(),
      statut: entry.statut === "PRET_A_PUBLIER" ? "A_COMPLETER" : entry.statut,
      updated_at: entry.updated_at || entry.created_at || new Date().toISOString(),
    });
  } catch {
    return [];
  }
}

const STATUS_LABELS: Record<Status, string> = {
  EN_TRANSIT: "En transit", A_COMPLETER: "À compléter", PRET_A_PUBLIER: "Prêt à publier", EN_LIGNE: "En ligne", VENDU: "Vendu",
};
const CHECKLIST_ITEMS: Array<{ key: keyof Checklist; label: string }> = [
  { key: "size", label: "Taille vérifiée" },
  { key: "condition", label: "État vérifié" },
  { key: "material", label: "Matière vérifiée ou inconnue signalée" },
  { key: "photos", label: "Photos nettes et complètes" },
  { key: "authenticity", label: "Authenticité contrôlée physiquement" },
];
const PHOTO_ANGLES = [
  "Vue globale (face)",
  "Vue arrière (dos)",
  "Étiquette col / marque",
  "Étiquette taille / compo",
  "Détail matière / texture",
  "Coutures / finitions",
  "Défauts éventuels",
  "Boutons / zip",
  "Mesures / mètre",
  "Vue portée / cintre",
  "Doublure / intérieur",
  "Vue supplémentaire",
];

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value || 0);
}

function getVintedDressingUrl(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "https://www.vinted.fr/closet";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  // Sur Vinted, les profils membres exigent l'ID numérique (ex: 142981723-durandflorian88)
  if (/^\d+/.test(trimmed)) {
    return `https://www.vinted.fr/member/${trimmed}?tab=closet`;
  }
  // Raccourci officiel Vinted : redirige automatiquement vers le dressing du compte connecté
  return "https://www.vinted.fr/closet";
}

function daysSince(date: string | undefined, referenceTime: number) {
  if (!date || !referenceTime) return 0;
  const days = Math.floor((referenceTime - new Date(date).getTime()) / 86_400_000);
  return Number.isFinite(days) ? Math.max(0, days) : 0;
}

function daysUntil(date: string | undefined, referenceTime: number) {
  if (!date || !referenceTime) return null;
  const deadline = new Date(`${date}T23:59:59`).getTime();
  if (!Number.isFinite(deadline)) return null;
  return Math.ceil((deadline - referenceTime) / 86_400_000);
}

function emptyChecklist(): Checklist {
  return { size: false, condition: false, material: false, photos: false, authenticity: false };
}

function isChecklistComplete(checklist?: Checklist) {
  return Boolean(checklist && CHECKLIST_ITEMS.every(({ key }) => checklist[key]));
}

function mergeStock(serverStock: Listing[], localStock: Listing[]) {
  const merged = new Map(serverStock.map((entry) => [entry.sku_id, entry]));
  for (const localEntry of localStock) {
    const serverEntry = merged.get(localEntry.sku_id);
    const localTime = Date.parse(localEntry.updated_at || localEntry.created_at || "") || 0;
    const serverTime = Date.parse(serverEntry?.updated_at || serverEntry?.created_at || "") || 0;
    if (!serverEntry || localTime >= serverTime) merged.set(localEntry.sku_id, localEntry);
  }
  return [...merged.values()];
}

function netProfit(entry: Listing) {
  if (!Number.isFinite(entry.prix_vendu)) return null;
  const fees = Number.isFinite(entry.frais_reels)
    ? entry.frais_reels!
    : Math.max(0, entry.cta_ttc - entry.prix_achat);
  return Number((entry.prix_vendu! - entry.prix_achat - fees).toFixed(2));
}

function statusClass(status: Status) {
  if (status === "VENDU") return "status status-sold";
  if (status === "EN_TRANSIT") return "status status-transit";
  if (status === "A_COMPLETER") return "status status-review";
  if (status === "EN_LIGNE") return "status status-live";
  return "status status-ready";
}

function _computeResalePrice(prixAchat: number, prixAffiche: number, prixMinX2: number) {
  const realisticPrice = Number(Math.max(prixAffiche, prixAchat * 1.8 + 8).toFixed(2));
  const belowX2 = realisticPrice < prixMinX2;
  return {
    prix_revente: realisticPrice,
    belowX2,
    warning: belowX2 ? `Le prix réel de revente est en dessous du plancher x2 (${euro(realisticPrice)} < ${euro(prixMinX2)}). Tu peux le valider si le marché le justifie, mais il faudra en tenir compte.` : "",
  };
}

async function photoToDataUrl(file: File) {
  if (typeof createImageBitmap !== "function") {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
      reader.readAsDataURL(file);
    });
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Format image non pris en charge : ${file.name}`);
  }
  const scale = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`Compression impossible : ${file.name}`)), "image/jpeg", 0.78);
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
    reader.readAsDataURL(blob);
  });
}

async function compressPhotoDataUrl(dataUrl: string, maxDimension: number, quality: number) {
  const image = new window.Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Compression des photos indisponible dans ce navigateur.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Compression de photo impossible.")), "image/jpeg", quality);
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture de la photo compressée impossible."));
    reader.readAsDataURL(blob);
  });
}

async function stitchPhotosToCollage(photos: Photo[]): Promise<Photo> {
  if (photos.length === 1) return photos[0];

  const loaded = await Promise.all(
    photos.map(async (photo) => {
      const img = new window.Image();
      img.src = photo.dataUrl;
      await img.decode();
      return { img, angle: photo.angle, name: photo.name };
    })
  );

  const count = loaded.length;
  const cols = count <= 2 ? count : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);

  const tileW = count <= 2 ? 400 : 340;
  const tileH = count <= 2 ? 400 : 340;
  const canvas = document.createElement("canvas");
  canvas.width = cols * tileW;
  canvas.height = rows * tileH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return photos[0];

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  loaded.forEach(({ img, angle }, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * tileW;
    const y = row * tileH;

    const scale = Math.min((tileW - 8) / img.naturalWidth, (tileH - 36) / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const drawX = x + (tileW - drawW) / 2;
    const drawY = y + 4 + (tileH - 36 - drawH) / 2;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(x, y + tileH - 28, tileW, 28);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(angle, x + tileW / 2, y + tileH - 14);
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Assemblage photo impossible."))),
      "image/jpeg",
      0.70
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture de l'assemblage impossible."));
    reader.readAsDataURL(blob);
  });

  const anglesSummary = photos.map((p) => p.angle).join(" · ");
  return {
    dataUrl,
    angle: `Planche multi-vues (${anglesSummary})`,
    name: `planche-${photos.length}-vues.jpg`,
  };
}

async function preparePhotosForAi(photos: Photo[]): Promise<Photo[]> {
  if (photos.length <= 2) return photos;

  // Jusqu'à 6 photos -> 1 seule planche (~1800 tokens)
  // Plus de 6 photos (7 à 12) -> 2 planches (~3600 tokens max)
  // Conserve la consommation très en dessous du plafond Groq de 8000 tokens/minute
  const groupCount = photos.length <= 6 ? 1 : 2;
  const groups: Photo[][] = Array.from({ length: groupCount }, () => []);
  photos.forEach((photo, i) => {
    groups[i % groupCount].push(photo);
  });

  return Promise.all(groups.map((group) => stitchPhotosToCollage(group)));
}

async function createAnalysisRequestBody(
  photos: Photo[],
  prixAchat: number | null,
  mode: Mode,
  skuId: string,
  aiConfig?: { provider?: AiProviderType; apiKey?: string; omnirouteBaseUrl?: string }
) {
  // Si plus de 3 photos, fusionne intelligemment en planches pour ne jamais dépasser la limite fournisseur tout en gardant tous les angles
  const preparedPhotos = await preparePhotosForAi(photos);

  const limitBytes = 3_500_000;
  const variants = [
    { maxDimension: 1500, quality: 0.78 },
    { maxDimension: 1200, quality: 0.65 },
    { maxDimension: 900, quality: 0.50 },
    { maxDimension: 720, quality: 0.40 },
    { maxDimension: 600, quality: 0.32 },
  ];

  for (const variant of variants) {
    const requestPhotos = variant.maxDimension === 1500 && variant.quality === 0.78
      ? preparedPhotos
      : await Promise.all(preparedPhotos.map(async (photo) => ({
        ...photo,
        dataUrl: await compressPhotoDataUrl(photo.dataUrl, variant.maxDimension, variant.quality),
      })));
    const body = JSON.stringify({
      photos: requestPhotos.map(({ dataUrl, angle }) => ({ dataUrl, angle })),
      prixAchat,
      mode,
      skuId,
      ...(aiConfig ? { aiConfig } : {}),
    });
    if (new Blob([body]).size <= limitBytes) return body;
  }

  throw new Error("Les photos dépassent encore la limite d’envoi. Réduis leur nombre ou leur taille puis réessaie.");
}

function CopyButton({ text, field, copied, onCopy, label = "Copier" }: {
  text: string; field: string; copied: string | null; onCopy: (_text: string, _field: string) => void; label?: string;
}) {
  const isCopied = copied === field;
  return (
    <button className={`icon-action ${isCopied ? "copied" : ""}`} onClick={() => onCopy(text, field)} title={isCopied ? "Copié" : label} aria-label={isCopied ? "Copié" : label}>
      {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
      <span>{isCopied ? "Copié" : label}</span>
    </button>
  );
}

function ChecklistFields({ checklist, onChange }: {
  checklist: Checklist;
  onChange: (_key: keyof Checklist, _checked: boolean) => void;
}) {
  const completed = CHECKLIST_ITEMS.filter(({ key }) => checklist[key]).length;
  return (
    <div className="checklist-fields">
      <div className="checklist-heading"><span>CONTRÔLES AVANT PUBLICATION</span><strong>{completed}/5</strong></div>
      <div className="checklist-options">
        {CHECKLIST_ITEMS.map(({ key, label }) => (
          <label key={key}><input type="checkbox" checked={checklist[key]} onChange={(event) => onChange(key, event.target.checked)} /><span>{label}</span></label>
        ))}
      </div>
    </div>
  );
}

function QrScanner({ onScan }: { onScan: (_value: string) => void }) {
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    let scanner: Html5QrcodeInstance | undefined;
    let cancelled = false;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (cancelled) return;
      scanner = new Html5Qrcode("sku-qr-reader");
      return scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 180 } },
        (decoded) => {
          onScan(decoded);
          void scanner?.stop().then(() => scanner?.clear()).catch(() => undefined);
        },
        () => undefined,
      ).catch(() => setScanError("Caméra indisponible. Autorise son accès ou saisis le SKU dans la recherche."));
    }).catch(() => setScanError("Le lecteur QR n'a pas pu démarrer."));
    return () => {
      cancelled = true;
      void scanner?.stop().then(() => scanner?.clear()).catch(() => undefined);
    };
  }, [onScan]);

  return <div className="scanner-panel"><div id="sku-qr-reader" />{scanError && <p className="inline-error">{scanError}</p>}</div>;
}

export default function VintedDashboard() {
  const [authReady, setAuthReady] = useState(false);
  const [referenceTime, setReferenceTime] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up" | "verify-email">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");
  const [resendError, setResendError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // AI Modal & config state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatusSummary | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProviderType>("auto");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiOmnirouteUrl, setAiOmnirouteUrl] = useState("");
  const [aiVisionModel, setAiVisionModel] = useState("");
  const [aiCopyModel, setAiCopyModel] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ status: "idle" | "testing" | "success" | "error"; message: string }>({ status: "idle", message: "" });
  const [aiFeedback, setAiFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [prixAchat, setPrixAchat] = useState("");
  const [mode, setMode] = useState<Mode>("SEMAINE_ACHAT");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Listing | null>(null);
  const [history, setHistory] = useState<Listing[]>([]);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [draftEdit, setDraftEdit] = useState<{ titre_seo: string; description: string; taille: string; prix_revente: string; statut: Status; checklist: Checklist; emplacement: string; fournisseur: string; date_achat: string; date_limite_retour: string }>({
    titre_seo: "",
    description: "",
    taille: "",
    prix_revente: "",
    statut: "PRET_A_PUBLIER",
    checklist: emptyChecklist(),
    emplacement: "",
    fournisseur: "",
    date_achat: "",
    date_limite_retour: "",
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [titleTab, setTitleTab] = useState<"seo" | "court">("seo");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"pipeline" | "stock" | "analytics" | "labels" | "vinted_live">("pipeline");
  const [filter, setFilter] = useState<Status | "TOUT">("TOUT");
  const [query, setQuery] = useState("");
  const [syncState, setSyncState] = useState("Synchronisation en attente");
  const [vintedUsername, setVintedUsername] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vinted_profile_url_or_id") || "durandflorian88";
    }
    return "durandflorian88";
  });
  const handleVintedUsernameChange = (val: string) => {
    setVintedUsername(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("vinted_profile_url_or_id", val);
    }
  };
  const [vintedLiveTab, setVintedLiveTab] = useState<"sales" | "online" | "import">("sales");
  const [vintedImportText, setVintedImportText] = useState("");
  const [shippingLabels, setShippingLabels] = useState<ShippingLabel[]>([]);
  const [activeShippingIndex, setActiveShippingIndex] = useState(0);
  const [shippingError, setShippingError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [buyerReplyType, setBuyerReplyType] = useState<"nego" | "dispo" | "dernier_prix" | "envoi">("nego");
  const [carrierPreset, setCarrierPreset] = useState<"auto" | "chronopost" | "mondial" | "colissimo" | "left" | "full">("auto");
  const originalPhotosRef = useRef<Map<string, string>>(new Map());
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setCmdOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    function handleOnline() {
      setIsOnline(true);
      toast.success("Connexion rétablie ! Mode Cloud synchronisé.");
    }
    function handleOffline() {
      setIsOnline(false);
      toast.warning("Mode Hors-ligne (Vidé-grenier) actif. Données stockées localement.", {
        description: "Vous pouvez continuer à travailler, le stock se synchronisera dès le retour du réseau.",
      });
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
    const client = supabaseRef.current;
    if (!client) throw new Error("Le client Supabase n'est pas initialisé.");
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError || !data.session) throw new Error("Connecte-toi pour continuer.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
    return fetch(input, { ...init, headers });
  }

  function applyAiStatus(status: AiStatusSummary | undefined) {
    if (!status) return;
    setAiStatus(status);
    setAiProvider(status.savedConfig.provider || "auto");
    setAiOmnirouteUrl(status.savedConfig.omnirouteBaseUrl || "");
    setAiVisionModel(status.savedConfig.visionModel || "");
    setAiCopyModel(status.savedConfig.copyModel || "");
  }

  function persist(next: Listing[]) {
    const now = new Date().toISOString();
    const normalized = next.map((entry) => ({ ...entry, updated_at: entry.updated_at || entry.created_at || now }));
    setHistory(normalized);
    if (userId) localStorage.setItem(localHistoryKey(userId), JSON.stringify(normalized));
    if (!unlocked || !userId) return;
    syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
      const response = await apiFetch("/api/vinted-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-stock", stock: normalized }),
      });
      if (!response.ok) throw new Error("Synchronisation impossible");
      setSyncState("Synchronisé sur le serveur");
    }).catch(() => setSyncState("Copie locale uniquement · serveur indisponible"));
  }

  async function synchronizeFromServer(localStock: Listing[], ownerId: string) {
    try {
      const response = await apiFetch("/api/vinted-pipeline?resource=stock");
      if (!response.ok) throw new Error("Lecture serveur impossible");
      const payload = await response.json() as { stock: Listing[]; aiStatus?: AiStatusSummary };
      if (payload.aiStatus) applyAiStatus(payload.aiStatus);
      const merged = mergeStock(Array.isArray(payload.stock) ? payload.stock : [], localStock);
      setHistory(merged);
      localStorage.setItem(localHistoryKey(ownerId), JSON.stringify(merged));
      const saveResponse = await apiFetch("/api/vinted-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-stock", stock: merged }),
      });
      if (!saveResponse.ok) throw new Error("Écriture serveur impossible");
      setSyncState("Synchronisé sur le serveur");
    } catch {
      setSyncState("Copie locale uniquement · serveur indisponible");
    }
  }

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};

    async function initializeAuth() {
      try {
        const client = getSupabaseBrowserClient();
        supabaseRef.current = client;
        const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, session) => {
          setUnlocked(Boolean(session));
          setUserId(session?.user.id || "");
          setSignedInEmail(session?.user.email || "");
          if (session) {
            const stored = readLocalHistory(session.user.id);
            setHistory(stored);
            await synchronizeFromServer(stored, session.user.id);
          } else {
            setHistory([]);
            setAiStatus(null);
          }
        });
        unsubscribe = () => subscription.unsubscribe();

        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;
        if (data.session) {
          const stored = readLocalHistory(data.session.user.id);
          setHistory(stored);
          setUnlocked(true);
          setUserId(data.session.user.id);
          setSignedInEmail(data.session.user.email || "");
          await synchronizeFromServer(stored, data.session.user.id);
        } else {
          setHistory([]);
        }
        setReferenceTime(Date.now());
      } catch (error) {
        if (active) setAuthError(error instanceof Error ? error.message : "Configuration Supabase invalide.");
      } finally {
        if (active) setAuthReady(true);
      }
    }

    void initializeAuth();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!loading) return;

    const start = Date.now();
    const targetDuration = 30_000;
    let frameId = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const ratio = Math.min(1, elapsed / targetDuration);
      const eased = 8 + ratio * 90;
      setProgress(Math.min(96, Math.round(eased)));
      if (ratio >= 1) {
        window.clearInterval(frameId);
        return;
      }
    };

    frameId = window.setInterval(tick, 900);
    return () => window.clearInterval(frameId);
  }, [loading]);

  const progressLabel = loading ? (
    progress < 25 ? "Préparation de la demande" :
    progress < 50 ? "Analyse des photos" :
    progress < 75 ? "Calcul du prix et du ROI" :
    progress < 95 ? "Rédaction de l'annonce" :
    "Finalisation"
  ) : "Prêt";

  const filteredHistory = useMemo(() => history.filter((entry) => {
    const matchesStatus = filter === "TOUT" || entry.statut === filter;
    const text = `${entry.sku_id} ${entry.marque} ${entry.modele} ${entry.titre_seo}`.toLowerCase();
    return matchesStatus && text.includes(query.toLowerCase());
  }), [history, filter, query]);

  const soldEntries = history.filter((entry) => entry.statut === "VENDU" && Number.isFinite(entry.prix_vendu));
  const globalProfit = soldEntries.reduce((total, entry) => total + (netProfit(entry) ?? 0), 0);
  const estimatedFeeCount = soldEntries.filter((entry) => !Number.isFinite(entry.frais_reels)).length;
  const committedCapital = history
    .filter((entry) => entry.statut !== "VENDU")
    .reduce((total, entry) => total + entry.cta_ttc, 0);
  const quickRotation = history.filter((entry) => {
    if (entry.statut !== "PRET_A_PUBLIER") return false;
    return daysSince(entry.created_at, referenceTime) < 14;
  }).length;
  const stagnantListings = history.filter((entry) => entry.statut === "EN_LIGNE" && daysSince(entry.date_publication, referenceTime) >= 14);
  const returnDeadlines = history.filter((entry) => entry.statut !== "VENDU" && daysUntil(entry.date_limite_retour, referenceTime) !== null && daysUntil(entry.date_limite_retour, referenceTime)! <= 3);
  const saleDurations = soldEntries.map((entry) => entry.date_vente && entry.created_at
    ? Math.max(0, Math.floor((Date.parse(entry.date_vente) - Date.parse(entry.created_at)) / 86_400_000))
    : null).filter((days): days is number => days !== null && Number.isFinite(days));
  const averageDaysToSale = saleDurations.length ? Math.round(saleDurations.reduce((total, days) => total + days, 0) / saleDurations.length) : null;
  const sellThroughRate = history.length ? Math.round((soldEntries.length / history.length) * 100) : 0;
  const categoryPerformance = Object.values(history.reduce<Record<string, { name: string; count: number; profit: number }>>((groups, entry) => {
    const name = entry.categorie || "Autre";
    const group = groups[name] || { name, count: 0, profit: 0 };
    group.count += 1;
    group.profit += netProfit(entry) ?? 0;
    groups[name] = group;
    return groups;
  }, {})).sort((left, right) => right.profit - left.profit);

  async function saveAiConfiguration(clearKey = false) {
    setAiPending(true);
    setAiFeedback(null);
    try {
      const response = await apiFetch("/api/vinted-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-ai-config",
          aiConfig: {
            provider: aiProvider,
            apiKey: clearKey ? "" : aiApiKey.trim(),
            omnirouteBaseUrl: aiOmnirouteUrl.trim(),
            visionModel: aiVisionModel.trim(),
            copyModel: aiCopyModel.trim(),
            clearApiKey: clearKey,
          },
        }),
      });
      const payload = (await response.json()) as { success: boolean; aiStatus?: AiStatusSummary; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Impossible d'enregistrer la configuration IA.");
      }
      if (payload.aiStatus) applyAiStatus(payload.aiStatus);
      if (clearKey) setAiApiKey("");
      setAiFeedback({ type: "success", text: "Configuration IA enregistrée avec succès sur votre compte !" });
      toast.success("Configuration IA enregistrée !");
    } catch (err) {
      setAiFeedback({ type: "error", text: err instanceof Error ? err.message : "Erreur de sauvegarde." });
      toast.error(err instanceof Error ? err.message : "Erreur de sauvegarde IA");
    } finally {
      setAiPending(false);
    }
  }

  async function testAiConnection() {
    setAiTestResult({ status: "testing", message: "Test d'appel IA en cours..." });
    setAiFeedback(null);
    try {
      const response = await apiFetch("/api/vinted-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-ai-config",
          aiConfig: {
            provider: aiProvider,
            apiKey: aiApiKey.trim(),
            omnirouteBaseUrl: aiOmnirouteUrl.trim(),
            visionModel: aiVisionModel.trim(),
            copyModel: aiCopyModel.trim(),
          },
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        providerLabel?: string;
        providerId?: string;
        aiStatus?: AiStatusSummary;
        error?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Test de connexion IA échoué.");
      }
      if (payload.aiStatus) applyAiStatus(payload.aiStatus);
      setAiTestResult({
        status: "success",
        message: `Connexion réussie avec ${payload.providerLabel || "le fournisseur IA"} !`,
      });
    } catch (err) {
      setAiTestResult({
        status: "error",
        message: err instanceof Error ? err.message : "Échec du test de connexion.",
      });
    }
  }

  async function handleResendEmail(customEmail?: string) {
    const emailToSend = (customEmail || verificationEmail || email).trim();
    if (!emailToSend) return;
    setResendPending(true);
    setResendError("");
    setResendNotice("");
    try {
      const client = supabaseRef.current;
      if (!client) throw new Error("Client Supabase non initialisé.");
      const redirectOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error: resendErr } = await client.auth.resend({
        type: "signup",
        email: emailToSend,
        options: { emailRedirectTo: redirectOrigin },
      });
      if (resendErr) {
        const msg = resendErr.message.toLowerCase();
        if (msg.includes("rate limit") || msg.includes("security") || resendErr.status === 429) {
          setResendNotice("Un e-mail vient déjà d'être envoyé. Merci de patienter une minute avant de redemander un envoi.");
        } else {
          throw resendErr;
        }
      } else {
        setResendNotice(`Un nouvel e-mail de confirmation vient d'être envoyé à ${emailToSend} !`);
        setResendCooldown(60);
      }
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Impossible de renvoyer l'e-mail.");
    } finally {
      setResendPending(false);
    }
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setShowResendButton(false);
    setResendError("");
    setResendNotice("");
    setAuthPending(true);
    const targetEmail = email.trim();

    try {
      const client = supabaseRef.current;
      if (!client) throw new Error("Supabase n'est pas configuré.");

      if (authMode === "sign-up") {
        const redirectOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
        const { data, error: signUpError } = await client.auth.signUp({
          email: targetEmail,
          password,
          options: {
            emailRedirectTo: redirectOrigin,
          },
        });

        if (signUpError) {
          const msg = signUpError.message.toLowerCase();
          if (msg.includes("already registered") || signUpError.status === 400 || signUpError.status === 422) {
            setVerificationEmail(targetEmail);
            setAuthError("Un compte existe déjà avec cette adresse e-mail. Si ton compte n'a pas encore été validé par e-mail, clique sur « Renvoyer l'e-mail de confirmation » ou passe sur « Se connecter ».");
            setShowResendButton(true);
            return;
          }
          if (msg.includes("rate limit") || msg.includes("security") || signUpError.status === 429) {
            setVerificationEmail(targetEmail);
            setAuthMode("verify-email");
            setResendNotice("Un e-mail de confirmation a déjà été expédié. Vérifie ta boîte de réception et tes spams.");
            return;
          }
          if (msg.includes("password")) {
            throw new Error("Le mot de passe doit comporter au moins 6 caractères.");
          }
          throw signUpError;
        }

        // Cas protection énumération Supabase : si user.identities est vide, le compte existait déjà
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setVerificationEmail(targetEmail);
          setAuthError("Cette adresse e-mail possède déjà un compte. Connecte-toi ou vérifie tes e-mails pour le lien d'activation.");
          setShowResendButton(true);
          return;
        }

        // Compte créé avec succès, e-mail de confirmation requis !
        if (!data.session) {
          setVerificationEmail(targetEmail);
          setAuthMode("verify-email");
          setResendNotice("");
          return;
        }

        // Si auto-confirm est activé sur Supabase :
        if (data.user) {
          const nextUserId = data.user.id;
          const stored = readLocalHistory(nextUserId);
          setHistory(stored);
          setUserId(nextUserId);
          setSignedInEmail(data.user.email || targetEmail);
          setUnlocked(true);
          await synchronizeFromServer(stored, nextUserId);
          return;
        }
      } else {
        // Connexion
        const { data, error: signInError } = await client.auth.signInWithPassword({
          email: targetEmail,
          password,
        });

        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes("email not confirmed")) {
            setVerificationEmail(targetEmail);
            setAuthMode("verify-email");
            setResendNotice("Ton compte a bien été créé, mais ton adresse e-mail n'a pas encore été confirmée. Clique sur le lien reçu dans tes e-mails (pense à vérifier tes spams).");
            return;
          }
          if (msg.includes("invalid login credentials")) {
            throw new Error("Identifiants incorrects. Vérifie ton mot de passe ou clique sur l'onglet « Créer un compte » si tu n'en as pas encore.");
          }
          throw signInError;
        }

        if (!data.user) throw new Error("Supabase n'a pas renvoyé le compte connecté.");
        const nextUserId = data.user.id;
        const stored = readLocalHistory(nextUserId);
        setHistory(stored);
        setUserId(nextUserId);
        setSignedInEmail(data.user.email || targetEmail);
        setUnlocked(true);
        await synchronizeFromServer(stored, nextUserId);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setAuthPending(false);
    }
  }

  async function signOut() {
    const client = supabaseRef.current;
    if (client) await client.auth.signOut();
    setUnlocked(false);
    setUserId("");
    setSignedInEmail("");
    setHistory([]);
    setResult(null);
    setPhotos([]);
  }

  function uploadPhotos(event: ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    if (!rawFiles.length) return;
    setError("");

    const remainingSlots = Math.max(0, 12 - photos.length);
    if (remainingSlots <= 0) {
      setError("Vous avez déjà atteint le maximum de 12 photos.");
      event.target.value = "";
      return;
    }

    const filesToProcess = rawFiles.slice(0, remainingSlots);
    if (rawFiles.length > remainingSlots) {
      setNotice(`Seules ${filesToProcess.length} photo(s) ont été ajoutées (limite de 12 atteinte).`);
    }

    Promise.all(
      filesToProcess.map(async (file, index) => {
        const absoluteIndex = photos.length + index;
        return {
          dataUrl: await photoToDataUrl(file),
          angle: PHOTO_ANGLES[absoluteIndex] || `Photo ${absoluteIndex + 1}`,
          name: file.name,
        };
      })
    )
      .then((newPhotos) => setPhotos((prev) => [...prev, ...newPhotos]))
      .catch((uploadError: Error) => setError(uploadError.message));

    event.target.value = "";
  }

  async function uploadPurchaseReceipt(sku: string, file: File) {
    if (file.size > 8 * 1024 * 1024) {
      setError("Le justificatif doit faire 8 Mo maximum.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Lecture du justificatif impossible."));
      reader.readAsDataURL(file);
    });
    const response = await apiFetch("/api/vinted-pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-receipt", skuId: sku, fileName: file.name, dataUrl }),
    });
    const payload = await response.json() as { success: boolean; receipt_name?: string; receipt_url?: string; error?: string };
    if (!response.ok || !payload.success || !payload.receipt_url) {
      setError(payload.error || "Enregistrement du justificatif impossible.");
      return;
    }
    updateListing(sku, { justificatif_nom: payload.receipt_name, justificatif_url: payload.receipt_url });
    setError("");
    setNotice("Justificatif d'achat enregistré sur le serveur.");
  }

  async function openReceipt(url: string) {
    const tab = window.open("about:blank", "_blank");
    try {
      const response = await apiFetch(url);
      if (!response.ok) throw new Error("Ouverture du reçu impossible.");
      const objectUrl = URL.createObjectURL(await response.blob());
      if (tab) tab.location.replace(objectUrl);
      else window.location.assign(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      tab?.close();
      setError(error instanceof Error ? error.message : "Ouverture du reçu impossible.");
    }
  }

  function getCarrierCoordinates(
    carrier: "chronopost" | "mondial" | "colissimo" | "left" | "full",
    w: number,
    h: number
  ) {
    if (carrier === "chronopost" || carrier === "mondial") {
      // Pour Mondial Relay et Chronopost Vinted A4 : TOUT À DROITE, début en haut
      // Largeur = 49% de la feuille A4 (de 50% à 99%)
      // Hauteur = ratio 2:3 (100x150mm thermique)
      const labelW = Math.floor(w * 0.495);
      const labelH = Math.floor(labelW * 1.5);
      return {
        cropArea: {
          x: Math.floor(w * 0.495),
          y: Math.floor(h * 0.012),
          width: labelW,
          height: Math.min(h, labelH),
        },
        crop: { x: -175, y: 135 },
        zoom: 2.15,
      };
    }

    if (carrier === "colissimo") {
      // Colissimo / La Poste : haut centré
      const labelW = Math.floor(w * 0.78);
      const labelH = Math.floor(labelW * 1.5);
      return {
        cropArea: {
          x: Math.floor(w * 0.11),
          y: Math.floor(h * 0.015),
          width: labelW,
          height: Math.min(h, labelH),
        },
        crop: { x: 0, y: 125 },
        zoom: 1.35,
      };
    }

    if (carrier === "left") {
      // Fiche de gauche (à l'intérieur du colis)
      const labelW = Math.floor(w * 0.49);
      const labelH = Math.floor(labelW * 1.5);
      return {
        cropArea: {
          x: Math.floor(w * 0.01),
          y: Math.floor(h * 0.012),
          width: labelW,
          height: Math.min(h, labelH),
        },
        crop: { x: 175, y: 125 },
        zoom: 2.15,
      };
    }

    // Format plein
    const labelH = Math.min(h, Math.floor(w * 1.5));
    return {
      cropArea: {
        x: 0,
        y: 0,
        width: w,
        height: labelH,
      },
      crop: { x: 0, y: 0 },
      zoom: 1,
    };
  }

  function nudgeCrop(dx: number, dy: number, dZoom = 0) {
    const active = shippingLabels[activeShippingIndex];
    if (!active) return;
    const newCrop = {
      x: Math.round((active.crop?.x ?? 0) + dx),
      y: Math.round((active.crop?.y ?? 0) + dy),
    };
    const newZoom = Math.max(1, Math.min(4, Number(((active.zoom ?? 1) + dZoom).toFixed(2))));
    updateShippingLabel(active.id, { crop: newCrop, zoom: newZoom });
  }

  async function rotateShippingLabel(id: string) {
    const active = shippingLabels.find((l) => l.id === id);
    if (!active) return;
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const newImageData = canvas.toDataURL("image/png");
      void autoDetectLabelCrop(newImageData).then((res) => {
        updateShippingLabel(id, {
          image: newImageData,
          cropArea: res.cropArea,
          crop: res.crop,
          zoom: res.zoom,
        });
        toast.success("Bordereau pivoté de 90° !");
      });
    };
    img.src = active.image;
  }

  function recordLiveSale(sku: string, salePrice: number, buyer = "") {
    const entry = history.find((item) => item.sku_id === sku);
    if (!entry) return;
    updateListing(sku, {
      statut: "VENDU",
      prix_vendu: salePrice,
      date_vente: new Date().toISOString(),
    });
    toast.success(`Vente enregistrée : ${sku} (${entry.marque} ${entry.modele})`, {
      description: `Montant encaissé : ${euro(salePrice)} ${buyer ? `· Acheteur : ${buyer}` : ""}`,
    });
  }

  function handleVintedSaleImport() {
    if (!vintedImportText.trim()) return;
    const text = vintedImportText.trim();
    const priceMatch = text.match(/(\d+([.,]\d{1,2})?)\s*(€|eur|euros)/i);
    const parsedPrice = priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : undefined;

    const onlineItems = history.filter((i) => i.statut === "EN_LIGNE" || i.statut === "PRET_A_PUBLIER");
    let matchedItem = onlineItems.find((i) => text.toLowerCase().includes(i.sku_id.toLowerCase()));

    if (!matchedItem) {
      matchedItem = onlineItems.find((i) => i.marque && text.toLowerCase().includes(i.marque.toLowerCase()));
    }

    if (matchedItem) {
      const finalPrice = parsedPrice || matchedItem.market_verdict?.prix_affiche_recommande || matchedItem.prix_revente;
      recordLiveSale(matchedItem.sku_id, finalPrice);
      setVintedImportText("");
      toast.success(`Article ${matchedItem.sku_id} (${matchedItem.marque}) marqué comme vendu !`);
    } else if (onlineItems.length > 0) {
      toast.info("Aucun article exact identifié automatiquement. Cliquez sur 'Noter vendu' sur l'article concerné ci-dessous.");
    } else {
      toast.error("Aucun article en ligne trouvé dans votre stock.");
    }
  }

  async function autoDetectLabelCrop(imageUrl: string): Promise<{
    cropArea: { x: number; y: number; width: number; height: number };
    crop: { x: number; y: number };
    zoom: number;
    detectedCarrier?: string;
  }> {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 800 / Math.max(w, h));
        const sw = Math.floor(w * scale);
        const sh = Math.floor(h * scale);
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(getCarrierCoordinates("chronopost", w, h));
          return;
        }
        ctx.drawImage(img, 0, 0, sw, sh);
        const imgData = ctx.getImageData(0, 0, sw, sh);
        const data = imgData.data;

        // Analyser la répartition gauche vs droite dans les 75% supérieurs
        const midX = Math.floor(sw / 2);
        const maxScanY = Math.floor(sh * 0.75);
        let leftDark = 0;
        let rightDark = 0;

        for (let y = Math.floor(sh * 0.03); y < maxScanY; y += 3) {
          for (let x = Math.floor(sw * 0.05); x < sw - Math.floor(sw * 0.05); x += 3) {
            const idx = (y * sw + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (r < 155 && g < 155 && b < 155) {
              if (x > midX + 10) {
                rightDark++;
              } else if (x < midX - 10) {
                leftDark++;
              }
            }
          }
        }

        // Si la colonne de droite contient le bordereau principal (ex: Chronopost / Shop2Shop avec v-chronopost et grand code-barres)
        if (rightDark > 120 && (rightDark >= leftDark * 0.65 || rightDark > 220)) {
          const res = getCarrierCoordinates("chronopost", w, h);
          resolve({ ...res, detectedCarrier: "Chronopost / Shop2Shop" });
          return;
        }

        // Si la colonne de gauche contient le bordereau principal (ex: Mondial Relay 2 colonnes)
        if (leftDark > 150 && rightDark < 80) {
          const res = getCarrierCoordinates("mondial", w, h);
          resolve({ ...res, detectedCarrier: "Mondial Relay" });
          return;
        }

        // Sinon bordereau haut centré
        const res = getCarrierCoordinates("colissimo", w, h);
        resolve({ ...res, detectedCarrier: "Colissimo / Centré" });
      };
      img.onerror = () => {
        resolve(getCarrierCoordinates("chronopost", 1000, 1500));
      };
      img.src = imageUrl;
    });
  }

  function applyCarrierPreset(carrier: "auto" | "mondial" | "chronopost" | "colissimo" | "left" | "full") {
    setCarrierPreset(carrier);
    const active = shippingLabels[activeShippingIndex];
    if (!active) return;
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      if (carrier === "auto") {
        void autoDetectLabelCrop(active.image).then((res) => {
          updateShippingLabel(active.id, { cropArea: res.cropArea, crop: res.crop, zoom: res.zoom });
          if (res.detectedCarrier?.includes("Chronopost")) setCarrierPreset("chronopost");
          else if (res.detectedCarrier?.includes("Mondial")) setCarrierPreset("mondial");
          else if (res.detectedCarrier?.includes("Colissimo")) setCarrierPreset("colissimo");
          toast.success(`Auto-détection : ${res.detectedCarrier || "Bordereau"} cadré avec succès !`);
        });
        return;
      }

      const res = getCarrierCoordinates(carrier, w, h);
      updateShippingLabel(active.id, { cropArea: res.cropArea, crop: res.crop, zoom: res.zoom });
      const labels = {
        chronopost: "⚡ Chronopost / Shop2Shop (Tout à droite)",
        mondial: "📦 Mondial Relay (Tout à droite)",
        colissimo: "📮 Colissimo (Haut Centré)",
        left: "📄 Fiche Destinataire (Gauche)",
        full: "📐 Plein Format",
      };
      toast.success(`Cadrage ${labels[carrier]} appliqué !`);
    };
    img.src = active.image;
  }

  async function printShippingLabelsThermal() {
    if (!shippingLabels.length) {
      setShippingError("Ajoute au moins un bordereau.");
      return;
    }
    const uncroppedIndex = shippingLabels.findIndex((label) => !label.cropArea);
    if (uncroppedIndex >= 0) {
      setActiveShippingIndex(uncroppedIndex);
      setShippingError(`Cadre le bordereau ${uncroppedIndex + 1} avant l'impression.`);
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Veuillez autoriser les fenêtres pop-up pour l'impression directe.");
      return;
    }

    const imagesHtml: string[] = [];
    for (const label of shippingLabels) {
      const img = new window.Image();
      img.src = label.image;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1500;
      const ctx = canvas.getContext("2d");
      if (!ctx || !label.cropArea) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1000, 1500);
      ctx.drawImage(img, label.cropArea.x, label.cropArea.y, label.cropArea.width, label.cropArea.height, 0, 0, 1000, 1500);
      const dataUrl = canvas.toDataURL("image/png");
      imagesHtml.push(`<div class="label-page"><img src="${dataUrl}" alt="Bordereau ${label.name}" /></div>`);
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impression Thermique 100x150 - Vinted COO</title>
          <style>
            @page {
              size: 100mm 150mm;
              margin: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              width: 100mm;
            }
            .label-page {
              width: 100mm;
              height: 150mm;
              page-break-after: always;
              page-break-inside: avoid;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .label-page img {
              width: 100mm;
              height: 150mm;
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          ${imagesHtml.join("")}
          <script>
            window.onload = function() {
              window.focus();
              setTimeout(function() {
                window.print();
                window.close();
              }, 350);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast.success("Impression thermique directe lancée !");
  }

  async function processPhotoCanvas(dataUrl: string, type: "boost" | "shadows" | "contrast"): Promise<string> {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        for (let i = 0; i < d.length; i += 4) {
          let r = d[i];
          let g = d[i + 1];
          let b = d[i + 2];

          if (type === "boost") {
            r = Math.min(255, Math.pow(r / 255, 0.9) * 255 * 1.05);
            g = Math.min(255, Math.pow(g / 255, 0.9) * 255 * 1.05);
            b = Math.min(255, Math.pow(b / 255, 0.9) * 255 * 1.05);
          } else if (type === "shadows") {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum < 150) {
              const boost = ((150 - lum) / 150) * 45;
              r = Math.min(255, r + boost);
              g = Math.min(255, g + boost);
              b = Math.min(255, b + boost);
            }
          } else if (type === "contrast") {
            const factor = (259 * (35 + 255)) / (255 * (259 - 35));
            r = Math.min(255, Math.max(0, factor * (r - 128) + 128));
            g = Math.min(255, Math.max(0, factor * (g - 128) + 128));
            b = Math.min(255, Math.max(0, factor * (g - 128) + 128));
          }

          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function applyStudioFilter(filterType: "boost" | "shadows" | "contrast" | "reset") {
    if (photos.length === 0) return;

    if (filterType === "reset") {
      setPhotos((current) =>
        current.map((photo) => {
          const orig = originalPhotosRef.current.get(photo.name);
          return orig ? { ...photo, dataUrl: orig } : photo;
        })
      );
      toast.success("Photos réinitialisées à l'original");
      return;
    }

    for (const p of photos) {
      if (!originalPhotosRef.current.has(p.name)) {
        originalPhotosRef.current.set(p.name, p.dataUrl);
      }
    }

    toast.info("Traitement Studio Photo en cours...");
    const processed = await Promise.all(
      photos.map(async (p) => {
        const orig = originalPhotosRef.current.get(p.name) || p.dataUrl;
        const filtered = await processPhotoCanvas(orig, filterType);
        return { ...p, dataUrl: filtered };
      })
    );

    setPhotos(processed);
    const labels = {
      boost: "Studio Boost (Lumière & Clarté)",
      shadows: "Débouchage des ombres",
      contrast: "Contraste dynamique",
    };
    toast.success(`Filtre ${labels[filterType]} appliqué sur ${photos.length} photo(s) !`);
  }

  function getBuyerResponseText(type: "nego" | "dispo" | "dernier_prix" | "envoi", item: Listing | null): string {
    if (!item) return "";
    const marque = item.marque || "la pièce";
    const modele = item.modele ? ` ${item.modele}` : "";
    const prixAffiche = item.market_verdict?.prix_affiche_recommande ?? item.prix_revente ?? item.prix_affiche;
    const prixPlancher = item.market_verdict?.prix_plancher ?? Math.max(1, Math.round(prixAffiche * 0.85));
    const contreOffre = item.market_verdict?.contre_offre ?? Math.max(1, Math.round(prixAffiche * 0.92));

    switch (type) {
      case "nego":
        return `Bonjour, merci pour votre proposition ! Compte tenu de l'état impeccable et de la rareté de ce modèle ${marque}${modele}, je ne peux pas descendre à ce montant. Je peux en revanche faire un geste et vous le laisser à ${contreOffre} € (offre valable 24h). Bonne journée !`;
      case "dispo":
        return `Bonjour ! Oui, la pièce est bien disponible et soigneusement emballée. Si vous finalisez la commande aujourd'hui, le colis sera déposé au point relais dès demain matin première heure !`;
      case "dernier_prix":
        return `Bonjour ! Le prix affiché de ${prixAffiche} € est déjà calculé au plus juste par rapport à la cote moyenne du marché pour une pièce authentique en cet état. Mon prix plancher ferme est de ${prixPlancher} €. Merci à vous et à disposition si besoin de mesures !`;
      case "envoi":
        return `Bonjour ! Oui expédition ultra-rapide garantie : je dépose tous mes colis sous 24h ouvrées maximum avec emballage soigné et suivi transporteur en temps réel !`;
    }
  }

  async function readShippingLabel(file: File): Promise<ShippingLabel> {
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} dépasse 20 Mo.`);
    let imageData: string;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const page = await pdfDocument.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error(`Aperçu PDF indisponible : ${file.name}.`);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      imageData = canvas.toDataURL("image/png");
    } else if (file.type.startsWith("image/")) {
      imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}.`));
        reader.readAsDataURL(file);
      });
    } else {
      throw new Error(`Format non pris en charge : ${file.name}.`);
    }
    const autoCrop = await autoDetectLabelCrop(imageData);
    if (autoCrop.detectedCarrier?.includes("Chronopost")) setCarrierPreset("chronopost");
    else if (autoCrop.detectedCarrier?.includes("Mondial")) setCarrierPreset("mondial");
    else if (autoCrop.detectedCarrier?.includes("Colissimo")) setCarrierPreset("colissimo");
    return {
      id: crypto.randomUUID(),
      name: file.name,
      image: imageData,
      crop: autoCrop.crop,
      zoom: autoCrop.zoom,
      cropArea: autoCrop.cropArea,
    };
  }

  async function loadShippingLabels(files: File[]) {
    setShippingError("");
    const loaded: ShippingLabel[] = [];
    const failures: string[] = [];
    for (const file of files) {
      try {
        loaded.push(await readShippingLabel(file));
      } catch (loadError) {
        failures.push(loadError instanceof Error ? loadError.message : `Erreur sur ${file.name}.`);
      }
    }
    if (loaded.length) {
      setShippingLabels((current) => [...current, ...loaded]);
      setActiveShippingIndex(shippingLabels.length);
    }
    setShippingError(failures.join(" "));
  }

  function updateShippingLabel(id: string, updates: Partial<ShippingLabel>) {
    setShippingLabels((current) => current.map((label) => label.id === id ? { ...label, ...updates } : label));
  }

  async function exportShippingLabels() {
    if (!shippingLabels.length) {
      setShippingError("Ajoute au moins un bordereau.");
      return;
    }
    const uncroppedIndex = shippingLabels.findIndex((label) => !label.cropArea);
    if (uncroppedIndex >= 0) {
      setActiveShippingIndex(uncroppedIndex);
      setShippingError(`Cadre le bordereau ${uncroppedIndex + 1} avant l'export.`);
      return;
    }
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      for (const label of shippingLabels) {
        const image = new window.Image();
        image.src = label.image;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 1000;
        canvas.height = 1500;
        const context = canvas.getContext("2d");
        if (!context || !label.cropArea) throw new Error(`Préparation impossible : ${label.name}.`);
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, label.cropArea.x, label.cropArea.y, label.cropArea.width, label.cropArea.height, 0, 0, canvas.width, canvas.height);
        const jpegData = canvas.toDataURL("image/jpeg", 0.96).split(",")[1];
        const page = pdf.addPage([283.46, 425.2]);
        const embedded = await pdf.embedJpg(jpegData);
        page.drawImage(embedded, { x: 0, y: 0, width: 283.46, height: 425.2 });
      }
      const bytes = await pdf.save();
      const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([pdfBuffer], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "bordereaux-100x150.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setShippingError("");
    } catch (exportError) {
      setShippingError(exportError instanceof Error ? exportError.message : "Export PDF impossible.");
    }
  }

  async function runPipeline() {
    if (photos.length < 1) {
      setError("Ajoutez au moins une photo de l'article pour lancer l'analyse (jusqu'à 12 photos).");
      return;
    }
    if (photos.length > 12) {
      setError("Vous pouvez ajouter jusqu'à 12 photos maximum.");
      return;
    }
    if (prixAchat && (!Number.isFinite(Number(prixAchat)) || Number(prixAchat) < 0)) {
      setError("Le prix d'achat doit être un montant positif.");
      return;
    }
    setLoading(true);
    setProgress(8);
    setError("");
    setNotice("");
    try {
      const skuResponse = await apiFetch("/api/vinted-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reserve-sku" }),
      });
      const skuPayload = await skuResponse.json() as { success: boolean; skuId?: string; error?: string };
      if (!skuResponse.ok || !skuPayload.success || !skuPayload.skuId) throw new Error(skuPayload.error || "Réservation du SKU impossible.");
      const analysisBody = await createAnalysisRequestBody(
        photos,
        prixAchat ? Number(prixAchat) : null,
        mode,
        skuPayload.skuId,
        {
          provider: aiProvider,
          apiKey: aiApiKey.trim() || undefined,
          omnirouteBaseUrl: aiOmnirouteUrl.trim() || undefined,
        }
      );
      const response = await apiFetch("/api/vinted-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: analysisBody,
      });
      const payload = await response.json().catch(() => null) as { success: boolean; data?: Listing; error?: string; warning?: string } | null;
      if (response.status === 413) throw new Error("Les photos dépassent la limite d’envoi du serveur. Réduis leur nombre ou leur taille puis réessaie.");
      if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.error || "Le pipeline n'a pas abouti.");
      setProgress(100);
      setResult(payload.data);
      persist([payload.data, ...history.filter((entry) => entry.sku_id !== payload.data!.sku_id)]);
      if (payload.warning) setNotice(payload.warning);
      else setNotice(payload.data.sync_sheet ? "Article ajouté au stock et synchronisé avec Google Sheets." : "Article ajouté au stock local.");
      if (mode === "SOURCING_CAPTURE") {
        toast.success("Analyse d'achat terminée !", {
          description: payload.data.marque ? `${payload.data.marque} ${payload.data.modele || ""} · Verdict prêt` : "Verdict d'arbitrage prêt",
        });
      } else {
        toast.success("Fiche article générée !", {
          description: `SKU ${payload.data.sku_id} enregistré dans l'inventaire`,
        });
      }
      window.setTimeout(() => setLoading(false), 700);
    } catch (pipelineError) {
      setProgress(0);
      const errorMsg = pipelineError instanceof Error ? pipelineError.message : "Erreur de connexion au pipeline.";
      setError(errorMsg);
      toast.error(errorMsg);
      setLoading(false);
    }
  }

  async function copyText(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(25); } catch {}
      }
      setCopied(field);
      window.setTimeout(() => setCopied(null), 1800);
      toast.success("Copié !", {
        description: text.length > 50 ? `${text.slice(0, 47)}...` : text,
        duration: 1800,
      });
    } catch {
      setError("Le presse-papiers est indisponible dans ce navigateur.");
      toast.error("Presse-papiers indisponible dans ce navigateur");
    }
  }

  function updateListing(sku: string, updates: Partial<Listing>) {
    persist(history.map((entry) => entry.sku_id === sku ? {
      ...entry,
      ...updates,
      updated_at: new Date().toISOString(),
      ...(updates.statut === "EN_LIGNE" && entry.statut !== "EN_LIGNE" ? { date_publication: new Date().toISOString() } : {}),
      ...(updates.statut === "VENDU" && entry.statut !== "VENDU" ? { date_vente: new Date().toISOString() } : {}),
    } : entry));
    if (result?.sku_id === sku) setResult({ ...result, ...updates });
  }

  function updateChecklistItem(sku: string, key: keyof Checklist, checked: boolean) {
    const entry = history.find((item) => item.sku_id === sku);
    if (!entry) return;
    const checklist = { ...(entry.checklist || emptyChecklist()), [key]: checked };
    const completed = isChecklistComplete(checklist);
    const status = entry.statut === "A_COMPLETER" && completed
      ? "PRET_A_PUBLIER"
      : entry.statut === "PRET_A_PUBLIER" && !completed ? "A_COMPLETER" : entry.statut;
    updateListing(sku, { checklist, statut: status });
  }

  function changeListingStatus(entry: Listing, status: Status) {
    if ((status === "PRET_A_PUBLIER" || status === "EN_LIGNE") && !isChecklistComplete(entry.checklist)) {
      const msg = "Valide les cinq points de la checklist avant de marquer l'article comme prêt ou en ligne.";
      setError(msg);
      toast.error(msg);
      return;
    }
    setError("");
    updateListing(entry.sku_id, { statut: status });
    toast.success(`${entry.sku_id} · Statut mis à jour`, {
      description: STATUS_LABELS[status],
    });
  }

  function applyPriceSuggestion(entry: Listing) {
    const suggestedPrice = Math.max(1, Math.floor(entry.prix_revente * 0.95));
    updateListing(entry.sku_id, { prix_revente: suggestedPrice, prix_affiche: suggestedPrice });
    setNotice(`Prix de ${entry.sku_id} ajusté à ${euro(suggestedPrice)} (-5 %).`);
    toast.info(`Prix ajusté à ${euro(suggestedPrice)} (-5 %)`);
  }

  function markRelisted(entry: Listing) {
    updateListing(entry.sku_id, { statut: "EN_LIGNE", date_publication: new Date().toISOString() });
    setNotice(`${entry.sku_id} marqué comme remis en ligne.`);
    toast.success(`${entry.sku_id} remis en ligne !`);
  }

  function handleQrScan(value: string) {
    let scannedSku = value.trim();
    try {
      scannedSku = new URL(value).searchParams.get("sku") || scannedSku;
    } catch {
      // Plain numeric QR values are accepted as SKUs.
    }
    setQuery(scannedSku.trim());
    setFilter("TOUT");
    setView("stock");
    setScannerOpen(false);
  }

  function startEditing(entry: Listing) {
    setEditingSku(entry.sku_id);
    setDraftEdit({
      titre_seo: entry.titre_seo,
      description: entry.description,
      taille: entry.taille,
      prix_revente: String(entry.prix_revente ?? entry.prix_affiche ?? 0),
      statut: entry.statut,
      checklist: entry.checklist || emptyChecklist(),
      emplacement: entry.emplacement || "",
      fournisseur: entry.fournisseur || "",
      date_achat: entry.date_achat || "",
      date_limite_retour: entry.date_limite_retour || "",
    });
  }

  function saveEditedListing() {
    if (!editingSku) return;
    const cleanedPrice = Number(draftEdit.prix_revente);
    if (!Number.isFinite(cleanedPrice) || cleanedPrice <= 0) {
      setError("Le prix de revente doit être un montant valide.");
      return;
    }
    if ((draftEdit.statut === "PRET_A_PUBLIER" || draftEdit.statut === "EN_LIGNE") && !isChecklistComplete(draftEdit.checklist)) {
      setError("Valide les cinq points de la checklist avant de marquer l'article comme prêt ou en ligne.");
      return;
    }
    setError("");
    const nextHistory = history.map((entry) => {
      if (entry.sku_id !== editingSku) return entry;
      const updatedSize = draftEdit.taille.trim() || entry.taille;
      const sizeWasMissing = entry.taille === "À renseigner manuellement";
      const title = draftEdit.titre_seo.trim() || entry.titre_seo;
      const description = draftEdit.description.trim() || entry.description;
      const nextEntry = {
        ...entry,
        titre_seo: sizeWasMissing && updatedSize !== entry.taille ? title.replace(/taille à renseigner/gi, updatedSize) : title,
        description: sizeWasMissing && updatedSize !== entry.taille ? description.replace(/Taille\s*:\s*À renseigner manuellement/gi, `Taille : ${updatedSize}`) : description,
        taille: updatedSize,
        statut: draftEdit.statut,
        checklist: draftEdit.checklist,
        emplacement: draftEdit.emplacement.trim(),
        fournisseur: draftEdit.fournisseur.trim(),
        date_achat: draftEdit.date_achat,
        date_limite_retour: draftEdit.date_limite_retour,
        updated_at: new Date().toISOString(),
        ...(draftEdit.statut === "EN_LIGNE" && entry.statut !== "EN_LIGNE" ? { date_publication: new Date().toISOString() } : {}),
        ...(draftEdit.statut === "VENDU" && entry.statut !== "VENDU" ? { date_vente: new Date().toISOString() } : {}),
        prix_revente: cleanedPrice,
        prix_affiche: cleanedPrice > entry.prix_min_x2 ? cleanedPrice : entry.prix_affiche,
      };
      return nextEntry;
    });
    persist(nextHistory);
    if (result?.sku_id === editingSku) {
      const updated = nextHistory.find((entry) => entry.sku_id === editingSku) || result;
      setResult({ ...updated, prix_revente: cleanedPrice, statut: draftEdit.statut });
    }
    setEditingSku(null);
    setNotice("Article mis à jour.");
  }

  function deleteListing(sku: string) {
    const shouldDelete = window.confirm("Supprimer cet article du stock ?");
    if (!shouldDelete) return;
    const nextHistory = history.filter((entry) => entry.sku_id !== sku);
    persist(nextHistory);
    if (unlocked) {
      syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
        const response = await apiFetch("/api/vinted-pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete-stock", skuId: sku }),
        });
        if (!response.ok) throw new Error("Suppression centrale impossible");
        setSyncState("Synchronisé sur le serveur");
      }).catch(() => setSyncState("Copie locale uniquement · suppression serveur échouée"));
    }
    if (result?.sku_id === sku) setResult(null);
    setEditingSku(null);
    setNotice("Article supprimé du stock.");
    toast.success("Article supprimé du stock");
  }

  function exportCsv() {
    const columns: (keyof Listing)[] = ["sku_id", "marque", "modele", "taille", "statut", "emplacement", "fournisseur", "date_achat", "date_limite_retour", "prix_achat", "cta_ttc", "prix_min_x2", "prix_affiche", "prix_revente", "prix_vendu", "frais_reels"];
    const rows = [columns.join(";"), ...filteredHistory.map((entry) => columns.map((column) => `"${String(entry[column] ?? "").replaceAll('"', '""')}"`).join(";"))];
    const url = URL.createObjectURL(new Blob(["\uFEFF", rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "vinted-coo-stock.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Inventaire CSV exporté !", {
      description: `${filteredHistory.length} article(s) inclus`,
    });
  }

  const ctaPreview = prixAchat ? Number(prixAchat) * 1.05 + 4.2 : 0;
  const minPreview = ctaPreview * 2;
  const activeShippingLabel = shippingLabels[activeShippingIndex];

  if (!authReady) return <main className="auth-screen"><div className="auth-card"><RefreshCw className="size-5 animate-spin text-emerald-400" /><span>Initialisation du tableau de bord...</span></div></main>;
  if (!unlocked) {
    if (authMode === "verify-email") {
      return (
        <main className="auth-screen">
          <section className="auth-card">
            <div className="brand-mark text-emerald-400"><MailCheck className="size-5" /></div>
            <p className="eyebrow">ACTIVATION DU COMPTE <span>·</span> VINTED COO</p>
            <h1>Vérifie ta boîte de réception</h1>
            <p className="auth-copy">
              Un e-mail de confirmation vient d&apos;être envoyé à <strong>{verificationEmail || email}</strong>.
            </p>
            <div className="auth-notice-box">
              <p>
                <strong>Étape 1 :</strong> Ouvre l&apos;e-mail de validation et clique sur le lien pour confirmer ton adresse.<br />
                <em>Pense à vérifier tes spams ou courriers indésirables si tu ne le trouves pas.</em>
              </p>
            </div>
            {resendNotice && <div className="alert-success mt-2"><CheckCircle2 className="size-4 shrink-0" />{resendNotice}</div>}
            {resendError && <div className="alert-error mt-2"><ShieldAlert className="size-4 shrink-0" />{resendError}</div>}
            <div className="auth-actions-stack">
              <button
                className="secondary-button w-full"
                type="button"
                disabled={resendCooldown > 0 || resendPending}
                onClick={() => void handleResendEmail()}
              >
                {resendPending ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
                {resendCooldown > 0 ? `Patienter ${resendCooldown}s avant renvoi` : "Renvoyer l'e-mail de confirmation"}
              </button>
              <button
                className="primary-button w-full"
                type="button"
                onClick={() => {
                  setAuthMode("sign-in");
                  setAuthError("");
                  setAuthMessage("Une fois le lien dans ton e-mail validé, connecte-toi ci-dessous.");
                }}
              >
                <CheckCircle2 className="size-4" /> J&apos;ai validé mon e-mail · Me connecter
              </button>
            </div>
            <button
              className="text-link mt-4"
              type="button"
              onClick={() => { setAuthMode("sign-up"); setAuthError(""); setAuthMessage(""); }}
            >
              Changer d&apos;adresse e-mail
            </button>
            <div className="auth-foot"><ShieldCheck className="size-4" /> Connexion sécurisée par Supabase Auth</div>
          </section>
        </main>
      );
    }

    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="brand-mark"><Zap className="size-5 fill-current" /></div>
          <p className="eyebrow">VINTED COO <span>·</span> ESPACE PRIVÉ</p>
          <h1>{authMode === "sign-in" ? "Connexion à ton espace" : "Créer un nouveau compte"}</h1>
          <p className="auth-copy">
            {authMode === "sign-in"
              ? "Connecte-toi pour accéder à ton inventaire, tes annonces et ton analyseur IA."
              : "Crée ton compte en quelques secondes. Un e-mail de confirmation te sera envoyé pour sécuriser ton accès."}
          </p>

          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              className={authMode === "sign-in" ? "active" : ""}
              onClick={() => { setAuthMode("sign-in"); setAuthError(""); setAuthMessage(""); setShowResendButton(false); }}
            >
              Se connecter
            </button>
            <button
              type="button"
              className={authMode === "sign-up" ? "active" : ""}
              onClick={() => { setAuthMode("sign-up"); setAuthError(""); setAuthMessage(""); }}
            >
              Créer un compte
            </button>
          </div>

          <form className="pin-form" onSubmit={authenticate}>
            <label htmlFor="account-email">Adresse e-mail</label>
            <div className="pin-input-wrap"><Mail className="size-4" /><input id="account-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required /></div>
            <label htmlFor="account-password">Mot de passe</label>
            <div className="pin-input-wrap"><LockKeyhole className="size-4" /><input id="account-password" type="password" autoComplete={authMode === "sign-up" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            {authError && <p className="inline-error">{authError}</p>}
            {authMessage && <p className="auth-copy text-emerald-400">{authMessage}</p>}
            {resendNotice && <p className="alert-success mt-2"><CheckCircle2 className="size-4 shrink-0" />{resendNotice}</p>}
            {resendError && <p className="alert-error mt-2"><ShieldAlert className="size-4 shrink-0" />{resendError}</p>}

            {showResendButton && (
              <div className="auth-alert-amber">
                <span>Tu n&apos;as pas reçu le lien d&apos;activation ou il a expiré ?</span>
                <button
                  type="button"
                  onClick={() => void handleResendEmail()}
                  disabled={resendPending || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Patienter ${resendCooldown}s...` : "Clique ici pour renvoyer l'e-mail de confirmation"}
                </button>
              </div>
            )}

            <button className="primary-button w-full mt-3" type="submit" disabled={authPending}>
              {authPending ? <RefreshCw className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
              {authMode === "sign-in" ? "Se connecter" : "Créer mon compte"}
              <ArrowRight className="size-4 ml-auto" />
            </button>
          </form>

          <button
            className="text-link mt-3"
            type="button"
            onClick={() => {
              setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
              setAuthError("");
              setAuthMessage("");
              setShowResendButton(false);
            }}
          >
            {authMode === "sign-in" ? "Pas encore de compte ? Créer un compte" : "Déjà inscrit ? Me connecter"}
          </button>
          <div className="auth-foot"><ShieldCheck className="size-4" /> Connexion sécurisée par Supabase Auth</div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Vinted COO accueil"><span className="brand-mark"><Zap className="size-4 fill-current" /></span><span>VINTED<span className="brand-muted"> / COO</span></span></a>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="cmd-k-trigger"
            onClick={() => setCmdOpen(true)}
            title="Rechercher un article ou action (Cmd + K)"
          >
            <Search className="size-3.5" />
            <span>Recherche rapide...</span>
            <kbd className="cmd-k-badge">⌘K</kbd>
          </button>
          <div
            className={`network-pill ${isOnline ? "network-online" : "network-offline"}`}
            title={isOnline ? "Connecté au Cloud Vinted COO" : "Mode Hors-ligne Vidé-grenier"}
          >
            {isOnline ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            <span className="status-dot-vibrant" />
            <span>{isOnline ? "En ligne" : "Hors-ligne"}</span>
          </div>
        </div>
        <div className="topbar-center"><span className="live-dot" /> PIPELINE OPÉRATIONNEL <span className="topbar-divider">/</span> EUROPE · PARIS</div>
        <button className="icon-action lock-action" onClick={signOut} title="Se déconnecter" aria-label="Se déconnecter"><LogOut className="size-4" /><span>{signedInEmail || "Déconnexion"}</span></button>
      </header>

      <div className={`dashboard-content ${result ? "has-sticky-bar" : ""}`} id="top">
        <section className="page-heading">
          <div><p className="eyebrow">COCKPIT DE REVENTE <span>·</span> {new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>Le stock, <span>sous contrôle.</span></h1><p className="heading-copy">Analysez, arbitrez et préparez vos prochaines annonces depuis un seul poste.</p></div>
          <div className="heading-actions">
            <span className="secure-pill"><ShieldCheck className="size-3.5" /> SESSION CHIFFRÉE</span>
            <button
              type="button"
              className={`icon-action ai-status-button ${aiStatus && (!aiStatus.ready || aiStatus.localOnlyWarning) ? "ai-status-warning" : ""}`}
              onClick={() => { setAiModalOpen(true); setAiFeedback(null); }}
              title="Configurer le moteur d'intelligence artificielle"
            >
              <Sparkles className="size-3.5" />
              <span>{aiStatus?.ready && !aiStatus.localOnlyWarning ? (aiStatus.activeProviderLabel || "IA Active") : "Moteur IA"}</span>
            </button>
            <button className="primary-button" onClick={() => { setView("pipeline"); setResult(null); }}><Plus className="size-4" /> Nouvel article</button>
          </div>
        </section>

        {aiStatus && (!aiStatus.ready || aiStatus.localOnlyWarning) && (
          <div className="alert-warning ai-cloud-callout">
            <ShieldAlert className="size-4 shrink-0" />
            <div>
              <strong>
                {!aiStatus.ready
                  ? "Moteur IA non configuré pour le site déployé"
                  : "Attention : mode local OmniRoute (localhost:20128) inaccessible sur le site déployé"}
              </strong>
              <span>
                Pour que l&apos;analyse des photos (titre, description, prix) fonctionne pour tout le monde sur le site déployé, ajoutez une clé Cloud gratuite (Google Gemini ou OpenRouter) ou configurez <code>GEMINI_API_KEY</code> sur Vercel.
              </span>
              <button type="button" className="text-link" onClick={() => { setAiModalOpen(true); setAiFeedback(null); }}>
                Configurer l&apos;IA Cloud maintenant <ArrowRight className="size-3" />
              </button>
            </div>
          </div>
        )}

        <section className="metrics-grid" aria-label="Indicateurs globaux">
          <article className="metric-tile"><span className="metric-icon green"><Wallet className="size-4" /></span><span className="metric-label">Capital engagé</span><strong>{euro(committedCapital)}</strong><small>En transit et prêt à publier</small></article>
          <article className="metric-tile"><span className="metric-icon blue"><TrendingUp className="size-4" /></span><span className="metric-label">Rentabilité réalisée</span><strong className={globalProfit < 0 ? "text-red-300" : ""}>{euro(globalProfit)}</strong><small>{estimatedFeeCount ? `${estimatedFeeCount} vente${estimatedFeeCount > 1 ? "s" : ""} avec frais estimés` : "Prix encaissé − achat − frais réels"}</small></article>
          <article className="metric-tile"><span className="metric-icon amber"><Box className="size-4" /></span><span className="metric-label">Rotation rapide</span><strong>{quickRotation.toString().padStart(2, "0")} <em>articles</em></strong><small>Prêts à publier · cible &lt; 14 jours</small></article>
          <article className="metric-tile metric-feature"><div><span className="metric-label">Fenêtre de publication</span><strong>VEN → DIM</strong><small>Créneaux recommandés uniquement</small></div><span className="metric-icon blue"><ShieldCheck className="size-4" /></span><div className="week-strip"><span>LU</span><span>MA</span><span>ME</span><span>JE</span><span className="active">VE</span><span className="active">SA</span><span className="active">DI</span></div></article>
        </section>

        <nav className="view-tabs" aria-label="Vues du tableau de bord">
          <button className={view === "pipeline" ? "selected" : ""} onClick={() => setView("pipeline")}><Sparkles className="size-4" /> Pipeline IA</button>
          <button className={view === "stock" ? "selected" : ""} onClick={() => setView("stock")}><PackageCheck className="size-4" /> Stock & historique <span className="tab-count">{history.length}</span></button>
          <button className={view === "vinted_live" ? "selected" : ""} onClick={() => setView("vinted_live")}>
            <ExternalLink className="size-4" /> Ventes Vinted Live
            {history.filter((h) => h.statut === "VENDU").length > 0 && (
              <span className="tab-count text-emerald-400 font-bold">{history.filter((h) => h.statut === "VENDU").length}</span>
            )}
          </button>
          <button className={view === "analytics" ? "selected" : ""} onClick={() => setView("analytics")}><TrendingUp className="size-4" /> Analyses</button>
          <button className={view === "labels" ? "selected" : ""} onClick={() => setView("labels")}><Barcode className="size-4" /> Étiquettes</button>
          <span className="sync-indicator"><i />{syncState}</span>
        </nav>

        {view === "pipeline" ? (
          <section className="pipeline-layout">
            <div className="panel intake-panel">
              <div className="panel-heading">
                <div>
                  <span className="step-label">01 / INGESTION</span>
                  <h2>{mode === "SOURCING_CAPTURE" ? "Arbitrage Achat Sourcing" : "Nouvel article"}</h2>
                </div>
                <span className="panel-heading-icon">
                  {mode === "SOURCING_CAPTURE" ? <Search className="size-4 text-amber-400" /> : <ImagePlus className="size-4" />}
                </span>
              </div>

              {/* Toggle Mode: Vente vs Sourcing Capture */}
              <div className="intake-mode-toggle">
                <button
                  type="button"
                  className={`intake-mode-btn ${mode !== "SOURCING_CAPTURE" ? "active" : ""}`}
                  onClick={() => setMode("WEEKEND_SHOOTING")}
                >
                  <Tag className="size-3.5" />
                  <span>Vente (Mes articles)</span>
                </button>
                <button
                  type="button"
                  className={`intake-mode-btn ${mode === "SOURCING_CAPTURE" ? "active sourcing-active" : ""}`}
                  onClick={() => setMode("SOURCING_CAPTURE")}
                >
                  <Search className="size-3.5" />
                  <span>Arbitrage Achat (Capture)</span>
                </button>
              </div>

              <div className="flex items-center justify-between mb-1">
                <label className="field-label !mb-0" htmlFor="photo-upload">
                  {mode === "SOURCING_CAPTURE" ? "Captures d'écran de l'annonce" : "Photos multi-angles"}
                  <span>{mode === "SOURCING_CAPTURE" ? "1 à 4 captures d'écran" : "Jusqu'à 12 photos"}</span>
                </label>
                {photos.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-300 cursor-pointer font-medium transition-colors"
                    onClick={(e) => { e.preventDefault(); setPhotos([]); }}
                  >
                    Tout effacer
                  </button>
                )}
              </div>
              <label htmlFor="photo-upload" className="upload-zone">
                <input id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple onChange={uploadPhotos} />
                {photos.length ? (
                  <>
                    <div className="photo-count">
                      <ImagePlus className="size-4" />
                      {photos.length} image{photos.length > 1 ? "s" : ""} sélectionnée{photos.length > 1 ? "s" : ""}
                    </div>
                    {/* Studio Photo Bar */}
                    <div
                      className="photo-studio-bar"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="photo-studio-label">
                        <Wand2 className="size-3.5" /> Studio Photo :
                      </span>
                      <button
                        type="button"
                        className="studio-btn"
                        onClick={(e) => { e.preventDefault(); void applyStudioFilter("boost"); }}
                        title="Améliorer la luminosité et la clarté globale pour le feed Vinted"
                      >
                        <Sun className="size-3 text-amber-300" />
                        <span>Studio Boost</span>
                      </button>
                      <button
                        type="button"
                        className="studio-btn"
                        onClick={(e) => { e.preventDefault(); void applyStudioFilter("shadows"); }}
                        title="Éclaircir les zones d'ombres et vêtements sombres"
                      >
                        <Eye className="size-3 text-emerald-400" />
                        <span>Déboucher ombres</span>
                      </button>
                      <button
                        type="button"
                        className="studio-btn"
                        onClick={(e) => { e.preventDefault(); void applyStudioFilter("contrast"); }}
                        title="Rehausser les contrastes et les textures"
                      >
                        <Sliders className="size-3 text-blue-400" />
                        <span>Contraste Pro</span>
                      </button>
                      <button
                        type="button"
                        className="studio-btn"
                        onClick={(e) => { e.preventDefault(); void applyStudioFilter("reset"); }}
                        title="Revenir à la photo originale"
                      >
                        <RotateCcw className="size-3 text-zinc-400" />
                        <span>Original</span>
                      </button>
                    </div>
                    <div className="photo-grid">
                      {photos.map((photo, index) => (
                        <div className="photo-preview" key={`${photo.name}-${index}`}>
                          <Image src={photo.dataUrl} alt={photo.angle} fill unoptimized sizes="(max-width: 600px) 28vw, 100px" />
                          <span>{photo.angle}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              setPhotos(photos.filter((_, photoIndex) => photoIndex !== index));
                            }}
                            aria-label={`Retirer ${photo.name}`}
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {photos.length < 12 ? (
                      <span className="upload-again">
                        <Plus className="size-3" /> Ajouter d&apos;autres captures ({12 - photos.length} restante{12 - photos.length > 1 ? "s" : ""})
                      </span>
                    ) : (
                      <span className="upload-again text-amber-300">
                        Limite maximale atteinte
                      </span>
                    )}
                  </>
                ) : mode === "SOURCING_CAPTURE" ? (
                  <>
                    <span className="upload-icon"><Search className="size-5 text-amber-400" /></span>
                    <strong>Déposer la capture d&apos;écran de l&apos;annonce</strong>
                    <span>Annonce Vinted, Leboncoin, Depop... (1 à 4 captures)</span>
                    <div className="angle-chips">
                      <span><i>01</i>Capture d&apos;annonce</span>
                      <span><i>02</i>Photos vendeur</span>
                      <span><i>03</i>Étiquette vendeur</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="upload-icon"><Upload className="size-5" /></span>
                    <strong>Choisir les photos de l&apos;article</strong>
                    <span>JPG, PNG ou WebP · 1 à 12 photos</span>
                    <div className="angle-chips">
                      {PHOTO_ANGLES.slice(0, 4).map((angle, index) => (
                        <span key={angle}><i>{String(index + 1).padStart(2, "0")}</i>{angle}</span>
                      ))}
                    </div>
                  </>
                )}
              </label>
              <div className="field-row">
                <label className="field-label" htmlFor="purchase-price">
                  {mode === "SOURCING_CAPTURE" ? "Prix affiché sur l'annonce" : "Prix d'achat"}
                  <span>{mode === "SOURCING_CAPTURE" ? "Facultatif, lu sur la capture" : "Facultatif, estimation IA sinon"}</span>
                </label>
                <div className="price-input">
                  <span>€</span>
                  <input id="purchase-price" type="number" min="0" step="0.01" placeholder="À estimer" value={prixAchat} onChange={(event) => setPrixAchat(event.target.value)} />
                </div>
              </div>

              {mode !== "SOURCING_CAPTURE" && (
                <>
                  <div className="field-label mode-title">Mode opératoire</div>
                  <div className="mode-switch">
                    <button onClick={() => setMode("SEMAINE_ACHAT")} className={mode === "SEMAINE_ACHAT" ? "active" : ""}>
                      <span className="mode-dot green-dot" />
                      <span><b>Sourcing semaine</b><small>Négociation activée</small></span>
                    </button>
                    <button onClick={() => setMode("WEEKEND_SHOOTING")} className={mode === "WEEKEND_SHOOTING" ? "active" : ""}>
                      <span className="mode-dot blue-dot" />
                      <span><b>Session week-end</b><small>Préparation publication</small></span>
                    </button>
                  </div>
                </>
              )}

              {prixAchat ? (
                <div className="formula-preview">
                  <div><span>{mode === "SOURCING_CAPTURE" ? "Coût total estimé" : "CTA TTC estimé"}</span><strong>{euro(ctaPreview)}</strong></div>
                  <ArrowRight className="size-4" />
                  <div><span>Objectif minimum x2</span><strong>{euro(minPreview)}</strong></div>
                </div>
              ) : (
                <div className="formula-hint">
                  <ShieldAlert className="size-4" />
                  {mode === "SOURCING_CAPTURE" ? "Le prix vendeur et les frais Vinted seront extraits de la capture." : "Le prix d'achat cible sera estimé à partir des photos."}
                </div>
              )}
              {error && <div className="alert-error"><ShieldAlert className="size-4 shrink-0" />{error}</div>}
              {notice && <div className="alert-success"><CheckCircle2 className="size-4 shrink-0" />{notice}</div>}
              {loading && (
                <div className="progress-shell" aria-live="polite">
                  <div className="progress-header">
                    <span>Progression de la demande</span>
                    <strong>{progress}%</strong>
                  </div>
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                  <small>{progressLabel}</small>
                </div>
              )}
              <button className="primary-button pipeline-submit" disabled={loading} onClick={runPipeline}>
                {loading ? (
                  <><RefreshCw className="size-4 animate-spin" /> Analyse IA en cours...</>
                ) : mode === "SOURCING_CAPTURE" ? (
                  <><Zap className="size-4 fill-current text-amber-400" /> Arbitrer cet achat & avis sincère <ArrowRight className="size-4 ml-auto" /></>
                ) : (
                  <><Zap className="size-4 fill-current" /> Lancer l&apos;analyse IA <ArrowRight className="size-4 ml-auto" /></>
                )}
              </button>
              <p className="privacy-note"><LockKeyhole className="size-3" /> Images transmises au modèle IA, non conservées dans l&apos;historique local.</p>
            </div>

            <div className="result-column">
              {result ? <>
                <div className="panel result-panel">
                  <div className="result-topline"><span className="step-label">02 / ARBITRAGE & MARCHÉ</span><span className={statusClass(result.statut)}><i />{STATUS_LABELS[result.statut]}</span></div>
                  <div className="result-product">
                    <div>
                      <span className="product-brand">{result.marque}</span>
                      <h2>{result.modele}</h2>
                      <p>{result.categorie} <span>·</span> Taille {result.taille} <span>·</span> {result.etat}</p>
                    </div>
                    <div className="display-price">
                      <small>PRIX RAPIDE CIBLE</small>
                      <strong>{euro(result.market_verdict?.prix_vente_rapide ?? result.prix_revente ?? result.prix_affiche)}</strong>
                      <span>{result.market_verdict?.verdict_label || (result.prix_revente < result.prix_min_x2 ? "⚠️ sous seuil x2" : "Marge saine")}</span>
                    </div>
                  </div>

                  {/* Fiche d'Arbitrage Achat Sourcing (si capture d'annonce) */}
                  {result.sourcing_analysis && (
                    <div className={`sourcing-card sourcing-verdict-${result.sourcing_analysis.verdict.toLowerCase()}`}>
                      <div className="sourcing-banner">
                        <div className="flex items-center gap-2">
                          <span className={`sourcing-verdict-badge badge-${result.sourcing_analysis.verdict.toLowerCase()}`}>
                            {result.sourcing_analysis.verdict === "FONCE" ? <Flame className="size-4 fill-current" /> : result.sourcing_analysis.verdict === "NEGOCIE" ? <TrendingUp className="size-4" /> : <ShieldAlert className="size-4" />}
                            {result.sourcing_analysis.badge}
                          </span>
                          <strong className="text-xs text-white">{result.sourcing_analysis.titre}</strong>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          Délai estimé : <b className="text-white">{result.sourcing_analysis.delai_vente_estime}</b>
                        </span>
                      </div>

                      {/* Avis Sincère Quote */}
                      <div className={`sourcing-sincere-quote quote-${result.sourcing_analysis.verdict.toLowerCase()}`}>
                        <b className="block text-[9px] uppercase tracking-wider text-zinc-400 mb-1">Avis Sincère de l&apos;IA :</b>
                        {result.sourcing_analysis.avis_sincere}
                      </div>

                      {/* Financial Simulation Grid */}
                      <div>
                        <span className="text-[8px] tracking-wider text-zinc-400 uppercase font-mono font-semibold block mb-1.5">Simulation Financière de l&apos;Achat</span>
                        <div className="sourcing-finances-grid">
                          <div className="sourcing-finance-tile">
                            <span>Prix Vendeur</span>
                            <strong>{euro(result.sourcing_analysis.prix_affiche_vendeur)}</strong>
                            <small>affiché sur l&apos;annonce</small>
                          </div>
                          <div className="sourcing-finance-tile">
                            <span>Coût Total Réel</span>
                            <strong className="text-zinc-300">{euro(result.sourcing_analysis.cout_total_achat)}</strong>
                            <small>port & protection acheteur</small>
                          </div>
                          <div className="sourcing-finance-tile">
                            <span>Revente Vinted</span>
                            <strong className="text-blue-400">{euro(result.sourcing_analysis.prix_revente_rapide)}</strong>
                            <small>cote de liquidation &lt; 7j</small>
                          </div>
                          <div className="sourcing-finance-tile">
                            <span>Bénéfice Net</span>
                            <strong className={result.sourcing_analysis.benefice_net_estime > 0 ? "text-emerald-400" : "text-red-400"}>
                              {euro(result.sourcing_analysis.benefice_net_estime)}
                            </strong>
                            <small>ROI net ~{result.sourcing_analysis.roi_estime_pourcent}%</small>
                          </div>
                        </div>
                      </div>

                      {/* Negotiation Offer Box */}
                      {result.sourcing_analysis.message_offre && (
                        <div className="negotiation-offer-card">
                          <div className="negotiation-offer-header">
                            <strong>
                              <Wallet className="size-3.5 text-blue-400" />
                              Offre Conseillée : {euro(result.sourcing_analysis.offre_suggeree)}
                            </strong>
                            <CopyButton
                              text={result.sourcing_analysis.message_offre}
                              field="sourcing_offre"
                              copied={copied}
                              onCopy={copyText}
                              label="Copier message d'offre"
                            />
                          </div>
                          <div className="negotiation-message-preview">
                            &ldquo;{result.sourcing_analysis.message_offre}&rdquo;
                          </div>
                        </div>
                      )}

                      {/* Points Forts & Points de Vigilance */}
                      {(result.sourcing_analysis.points_forts.length > 0 || result.sourcing_analysis.points_vigilance.length > 0) && (
                        <div className="sourcing-points-grid">
                          <div className="sourcing-points-col points-positive">
                            <strong>Points Forts Revente</strong>
                            <ul>
                              {result.sourcing_analysis.points_forts.map((pt, i) => (
                                <li key={i}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="sourcing-points-col points-vigilance">
                            <strong>Points de Vigilance</strong>
                            <ul>
                              {result.sourcing_analysis.points_vigilance.map((pt, i) => (
                                <li key={i}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Real Market Reality & Sourcing Verdict Card */}
                  {result.market_verdict && (
                    <div className={`market-verdict-card verdict-status-${result.market_verdict.verdict === "EXCELLENT_SOURCING" ? "excellent" : result.market_verdict.verdict === "ACHAT_CORRECT" ? "correct" : "trop_cher"}`}>
                      <div className="verdict-header">
                        <div className="flex items-center gap-2">
                          <span className={`verdict-badge ${result.market_verdict.verdict === "EXCELLENT_SOURCING" ? "badge-excellent" : result.market_verdict.verdict === "ACHAT_CORRECT" ? "badge-correct" : "badge-trop_cher"}`}>
                            {result.market_verdict.verdict === "EXCELLENT_SOURCING" ? <Flame className="size-3.5 fill-current" /> : result.market_verdict.verdict === "ACHAT_CORRECT" ? <CheckCircle2 className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
                            {result.market_verdict.verdict_label}
                          </span>
                          <strong className="text-xs text-white">{result.market_verdict.velocite_label}</strong>
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          Médian marché : <b className="text-white">{euro(result.market_verdict.prix_marche_moyen)}</b>
                        </div>
                      </div>
                      
                      <p className="verdict-explanation">{result.market_verdict.analyse}</p>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[8px] tracking-wider text-zinc-400 uppercase font-mono font-semibold">Grille Stratégique des 4 Prix</span>
                          <span className="text-[8px] text-zinc-500">Cliquez pour copier</span>
                        </div>
                        <div className="strategic-prices-grid">
                          <button
                            type="button"
                            onClick={() => copyText(String(result.market_verdict!.prix_vente_rapide), "prix_rapide")}
                            className="strategic-price-box"
                            title="Prix parfait pour vendre en moins de 7 jours"
                          >
                            <span className="price-title text-emerald-400">⚡ Vente Rapide</span>
                            <strong className="text-emerald-400">{euro(result.market_verdict.prix_vente_rapide)}</strong>
                            <small>&lt; 7 jours · Liquidité max</small>
                            <span className="price-copy-hint">{copied === "prix_rapide" ? <Check className="size-2.5 text-emerald-400" /> : <Copy className="size-2.5" />}{copied === "prix_rapide" ? "Copié !" : "Copier"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => copyText(String(result.market_verdict!.prix_affiche_recommande), "prix_affiche")}
                            className="strategic-price-box highlight"
                            title="Prix à afficher sur Vinted avec marge de négociation"
                          >
                            <span className="price-title text-emerald-300">🎯 Prix Affiché</span>
                            <strong>{euro(result.market_verdict.prix_affiche_recommande)}</strong>
                            <small>+18% marge de négociation</small>
                            <span className="price-copy-hint">{copied === "prix_affiche" ? <Check className="size-2.5 text-emerald-400" /> : <Copy className="size-2.5" />}{copied === "prix_affiche" ? "Copié !" : "Copier"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => copyText(String(result.market_verdict!.contre_offre), "prix_contre_offre")}
                            className="strategic-price-box"
                            title="Contre-offre idéale à envoyer en message"
                          >
                            <span className="price-title text-blue-400">🤝 Contre-Offre</span>
                            <strong className="text-blue-300">{euro(result.market_verdict.contre_offre)}</strong>
                            <small>À proposer aux acheteurs</small>
                            <span className="price-copy-hint">{copied === "prix_contre_offre" ? <Check className="size-2.5 text-emerald-400" /> : <Copy className="size-2.5" />}{copied === "prix_contre_offre" ? "Copié !" : "Copier"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => copyText(String(result.market_verdict!.prix_plancher), "prix_plancher")}
                            className="strategic-price-box"
                            title="Ne pas descendre en dessous"
                          >
                            <span className="price-title text-amber-400">🛑 Prix Plancher</span>
                            <strong className="text-amber-300">{euro(result.market_verdict.prix_plancher)}</strong>
                            <small>Seuil de sécurité strict</small>
                            <span className="price-copy-hint">{copied === "prix_plancher" ? <Check className="size-2.5 text-emerald-400" /> : <Copy className="size-2.5" />}{copied === "prix_plancher" ? "Copié !" : "Copier"}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Financial Grid */}
                  <div className="financial-grid">
                    <div>
                      <span>Coût d&apos;acquisition (CTA)</span>
                      <strong>{euro(result.cta_ttc)}</strong>
                      <small>dont port & emballage</small>
                    </div>
                    <div>
                      <span>Seuil théorique x2</span>
                      <strong className="green-text">{euro(result.prix_min_x2)}</strong>
                      <small>2x coût total</small>
                    </div>
                    <div>
                      <span>Marge nette estimée</span>
                      <strong className={result.market_verdict?.verdict === "ACHAT_TROP_CHER" ? "text-amber-300" : "blue-text"}>
                        {euro(result.market_verdict ? result.market_verdict.prix_vente_rapide - result.cta_ttc : result.prix_revente - result.cta_ttc)}
                      </strong>
                      <small>
                        {result.market_verdict
                          ? `ROI réel ~${Math.round(((result.market_verdict.prix_vente_rapide - result.cta_ttc) / Math.max(1, result.cta_ttc)) * 100)}%`
                          : "hors frais de port"}
                      </small>
                    </div>
                  </div>

                  {/* Defects & Anti-Dispute Box */}
                  {((result.defauts_observes && result.defauts_observes.length > 0) || result.defauts_transparence) && (
                    <div className="defects-box">
                      <div className="defects-box-heading">
                        <span className="flex items-center gap-1.5">
                          <ShieldAlert className="size-3.5" />
                          DÉFAUTS & USURE DÉTECTÉS (ANTI-LITIGE VINTED)
                        </span>
                        {result.defauts_transparence && (
                          <CopyButton
                            text={result.defauts_transparence}
                            field="defauts_clause"
                            copied={copied}
                            onCopy={copyText}
                            label="Copier clause"
                          />
                        )}
                      </div>

                      {result.defauts_observes && result.defauts_observes.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {result.defauts_observes.map((def, idx) => (
                            <div key={idx} className="defect-item">
                              <span className="defect-severity severity-visible">
                                Observé
                              </span>
                              <div className="flex-1 flex flex-col gap-0.5">
                                <span>{def}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[9px] text-zinc-400">Aucun défaut visible détecté sur les photos fournies.</p>
                      )}

                      {result.defauts_transparence && (
                        <div className="transparency-clause">
                          &ldquo;{result.defauts_transparence}&rdquo;
                        </div>
                      )}
                    </div>
                  )}

                  <div className="schedule-line">
                    <span className="metric-icon blue"><ShieldCheck className="size-4" /></span>
                    <div><small>PROCHAIN CRÉNEAU OPSEC</small><strong>{result.creneau_publi}</strong></div>
                    <span className="sku-tag">{result.sku_id}</span>
                  </div>

                  <div className="authenticity-note">
                    <BadgeCheck className="size-4" />
                    <div>
                      <b>Contrôle visuel : {result.authenticite.niveau}</b>
                      <span>Une analyse photo ne certifie pas l&apos;authenticité. Vérification physique recommandée.</span>
                    </div>
                  </div>

                  <ChecklistFields checklist={result.checklist || emptyChecklist()} onChange={(key, checked) => updateChecklistItem(result.sku_id, key, checked)} />

                  {(result.caracteristiques.length > 0 || result.mesures) && (
                    <div className="item-facts">
                      <span>OBSERVATIONS IA</span>
                      <p>{result.caracteristiques.join(" · ")}{result.mesures && ` · Mesures : ${Object.entries(result.mesures).map(([key, value]) => `${key} ${value}`).join(", ")}`}</p>
                    </div>
                  )}

                  <div className="market-snapshot">
                    <div className="checklist-heading">
                      <span>COMPARABLES VINTED</span>
                      <strong>{result.market?.source === "vinted-live" ? `${result.market.count} annonces` : "Indisponible"}</strong>
                    </div>
                    {result.market?.source === "vinted-live" && result.market.count > 0 ? (
                      <p>{euro(result.market.min || 0)} – {euro(result.market.max || 0)} <span>· moyenne {euro(result.market.average || 0)}</span></p>
                    ) : (
                      <p>Aucun prix comparable récupéré pour cette recherche.</p>
                    )}
                    {result.market?.observed_at && (
                      <small>Relevé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(result.market.observed_at))}</small>
                    )}
                  </div>
                </div>

                <div className="panel copy-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="step-label">03 / CONTENU OPTIMISÉ</span>
                      <h2>{isChecklistComplete(result.checklist) ? "Annonce prête à publier" : "Annonce à vérifier"}</h2>
                    </div>
                    <span className="ai-badge"><Sparkles className="size-3" /> IA VINTED</span>
                  </div>

                  {mode === "SEMAINE_ACHAT" && result.message_nego && (
                    <div className="copy-block">
                      <div className="copy-block-heading">
                        <span>MESSAGE DE NÉGOCIATION</span>
                        <CopyButton text={result.message_nego} field="nego" copied={copied} onCopy={copyText} />
                      </div>
                      <p>{result.message_nego}</p>
                    </div>
                  )}

                  {/* Title block with Short vs SEO Algorithmic selector */}
                  <div className="copy-block">
                    <div className="copy-block-heading">
                      <div className="flex items-center gap-1.5">
                        <Tag className="size-3.5" />
                        <span>TITRE</span>
                      </div>
                      <div className="title-choice-tabs">
                        <button
                          type="button"
                          className={`title-choice-btn ${titleTab === "court" ? "active" : ""}`}
                          onClick={() => setTitleTab("court")}
                        >
                          Court & Direct
                        </button>
                        <button
                          type="button"
                          className={`title-choice-btn ${titleTab === "seo" ? "active" : ""}`}
                          onClick={() => setTitleTab("seo")}
                        >
                          SEO Algorithmique
                        </button>
                      </div>
                      <CopyButton
                        text={titleTab === "court" ? (result.titre_court || result.titre_seo) : result.titre_seo}
                        field="title"
                        copied={copied}
                        onCopy={copyText}
                      />
                    </div>
                    <p className="listing-title">
                      {titleTab === "court" ? (result.titre_court || result.titre_seo) : result.titre_seo}
                    </p>
                  </div>

                  {/* Description & Hashtags with Interactive pills */}
                  <div className="copy-block">
                    <div className="copy-block-heading">
                      <span>DESCRIPTION & HASHTAGS</span>
                      <CopyButton
                        text={`${result.description}\n\n${result.hashtags}`}
                        field="description"
                        copied={copied}
                        onCopy={copyText}
                        label="Tout copier"
                      />
                    </div>
                    <p className="listing-description">
                      {result.description}
                      <br /><br />
                      <span>{result.hashtags}</span>
                    </p>
                    {result.hashtags && (
                      <div className="hashtags-cloud">
                        {result.hashtags.split(/\s+/).filter((tag) => tag.startsWith("#")).map((tag, i) => (
                          <span
                            key={i}
                            className="hashtag-pill"
                            onClick={() => copyText(tag, `tag_${i}`)}
                            title="Cliquer pour copier ce hashtag"
                          >
                            {copied === `tag_${i}` ? "✓ " : ""}{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Réponses Rapides Acheteurs */}
                  <div className="buyer-replies-block">
                    <div className="buyer-replies-heading">
                      <span>
                        <MessageSquare className="size-3.5 text-emerald-400" />
                        Réponses Rapides Acheteurs
                      </span>
                      <CopyButton
                        text={getBuyerResponseText(buyerReplyType, result)}
                        field="buyer_reply"
                        copied={copied}
                        onCopy={copyText}
                        label="Copier le message"
                      />
                    </div>
                    <div className="buyer-tabs">
                      <button
                        type="button"
                        className={`buyer-tab-btn ${buyerReplyType === "nego" ? "active" : ""}`}
                        onClick={() => setBuyerReplyType("nego")}
                      >
                        📉 Offre abusive
                      </button>
                      <button
                        type="button"
                        className={`buyer-tab-btn ${buyerReplyType === "dispo" ? "active" : ""}`}
                        onClick={() => setBuyerReplyType("dispo")}
                      >
                        ⚡ &quot;C&apos;est dispo ?&quot;
                      </button>
                      <button
                        type="button"
                        className={`buyer-tab-btn ${buyerReplyType === "dernier_prix" ? "active" : ""}`}
                        onClick={() => setBuyerReplyType("dernier_prix")}
                      >
                        🏷️ &quot;Dernier prix ?&quot;
                      </button>
                      <button
                        type="button"
                        className={`buyer-tab-btn ${buyerReplyType === "envoi" ? "active" : ""}`}
                        onClick={() => setBuyerReplyType("envoi")}
                      >
                        📦 &quot;Envoi rapide ?&quot;
                      </button>
                    </div>
                    <div className="buyer-reply-box">
                      <p>{getBuyerResponseText(buyerReplyType, result)}</p>
                    </div>
                  </div>

                  <div className="result-footer">
                    <span><CheckCircle2 className="size-3.5" /> SKU ajouté à l&apos;historique local</span>
                    <button onClick={() => { setView("stock"); setFilter("TOUT"); }} className="text-link">
                      Voir le stock <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mobile Sticky Quick Bar */}
                <div className="mobile-sticky-bar">
                  <button
                    type="button"
                    className="sticky-btn"
                    onClick={() => copyText(titleTab === "court" ? (result.titre_court || result.titre_seo) : result.titre_seo, "sticky_titre")}
                  >
                    {copied === "sticky_titre" ? <Check className="size-3.5 text-emerald-400" /> : <Tag className="size-3.5" />}
                    <span>{copied === "sticky_titre" ? "Titre copié !" : "Titre"}</span>
                  </button>
                  <button
                    type="button"
                    className="sticky-btn"
                    onClick={() => copyText(String(result.market_verdict?.prix_affiche_recommande ?? result.prix_revente ?? result.prix_affiche), "sticky_prix")}
                  >
                    {copied === "sticky_prix" ? <Check className="size-3.5 text-emerald-400" /> : <Wallet className="size-3.5" />}
                    <span>{copied === "sticky_prix" ? "Prix copié !" : `Prix (${euro(result.market_verdict?.prix_affiche_recommande ?? result.prix_revente ?? result.prix_affiche)})`}</span>
                  </button>
                  <button
                    type="button"
                    className="sticky-btn"
                    onClick={() => copyText(`${result.description}\n\n${result.hashtags}`, "sticky_desc")}
                  >
                    {copied === "sticky_desc" ? <Check className="size-3.5 text-emerald-400" /> : <Clipboard className="size-3.5" />}
                    <span>{copied === "sticky_desc" ? "Desc copiée !" : "Description"}</span>
                  </button>
                  <a
                    href="https://www.vinted.fr/items/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sticky-btn sticky-btn-vinted"
                  >
                    <ExternalLink className="size-3.5" />
                    <span>Ouvrir Vinted</span>
                  </a>
                </div>
              </> : <div className="empty-analysis"><div className="empty-graphic"><span><ImagePlus className="size-6" /></span><i /><i /><i /></div><span className="step-label">EN ATTENTE D&apos;INGESTION</span><h2>Votre prochain achat commence ici.</h2><p>Ajoutez trois angles, lancez l&apos;analyse. L&apos;identification, le calcul du seuil et la rédaction se font en une seule passe.</p><div className="empty-flow"><span>VISION IA</span><ArrowRight className="size-3" /><span>ARBITRAGE ROI</span><ArrowRight className="size-3" /><span>ANNONCE</span></div></div>}
            </div>
          </section>
        ) : view === "stock" ? (
          <section className="panel stock-panel">
            <div className="stock-heading"><div><span className="step-label">INVENTAIRE LOCAL</span><h2>Stock & historique</h2><p>{history.length} article{history.length !== 1 ? "s" : ""} suivi{history.length !== 1 ? "s" : ""} sur cet appareil</p></div><button className="secondary-button" onClick={exportCsv} disabled={!filteredHistory.length}><ArrowDownToLine className="size-4" /> Exporter CSV</button></div>
            <div className="stock-controls"><div className="filter-tabs">{(["TOUT", "EN_TRANSIT", "A_COMPLETER", "PRET_A_PUBLIER", "EN_LIGNE", "VENDU"] as const).map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "TOUT" ? "Tout" : STATUS_LABELS[status]}<span>{status === "TOUT" ? history.length : history.filter((entry) => entry.statut === status).length}</span></button>)}</div><label className="search-box"><Search className="size-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SKU, marque, modèle..." /></label></div>
            {error && <div className="alert-error stock-error"><ShieldAlert className="size-4 shrink-0" />{error}</div>}
            {stagnantListings.length > 0 && <div className="stagnant-banner"><Clock3 className="size-4" /><span><strong>{stagnantListings.length} annonce{stagnantListings.length > 1 ? "s" : ""} en ligne depuis au moins 14 jours</strong><small>Révise le prix ou remets l&apos;annonce en ligne après l&apos;avoir actualisée sur Vinted.</small></span></div>}
            {returnDeadlines.length > 0 && <div className="return-banner"><CalendarDays className="size-4" /><span><strong>{returnDeadlines.length} délai{ returnDeadlines.length > 1 ? "s" : ""} de retour dans les 3 jours ou dépassé{ returnDeadlines.length > 1 ? "s" : ""}</strong><small>{returnDeadlines.map((entry) => `${entry.sku_id} · ${entry.date_limite_retour}`).join("  |  ")}</small></span></div>}
            {filteredHistory.length ? <div className="stock-list">{filteredHistory.map((entry) => <article className="stock-row" key={entry.sku_id}>
              {editingSku === entry.sku_id ? <div className="stock-edit-form">
                <input value={draftEdit.titre_seo} onChange={(event) => setDraftEdit((current) => ({ ...current, titre_seo: event.target.value }))} aria-label="Titre" />
                <input value={draftEdit.taille} onChange={(event) => setDraftEdit((current) => ({ ...current, taille: event.target.value }))} aria-label="Taille" placeholder="Taille à renseigner manuellement" />
                <textarea value={draftEdit.description} onChange={(event) => setDraftEdit((current) => ({ ...current, description: event.target.value }))} aria-label="Description" />
                <div className="purchase-fields"><input value={draftEdit.emplacement} onChange={(event) => setDraftEdit((current) => ({ ...current, emplacement: event.target.value }))} placeholder="Emplacement · bac / étagère" aria-label="Emplacement physique" /><input value={draftEdit.fournisseur} onChange={(event) => setDraftEdit((current) => ({ ...current, fournisseur: event.target.value }))} placeholder="Vendeur / boutique" aria-label="Fournisseur" /><label><span>Acheté le</span><input type="date" value={draftEdit.date_achat} onChange={(event) => setDraftEdit((current) => ({ ...current, date_achat: event.target.value }))} aria-label="Date d'achat" /></label><label><span>Retour avant</span><input type="date" value={draftEdit.date_limite_retour} onChange={(event) => setDraftEdit((current) => ({ ...current, date_limite_retour: event.target.value }))} aria-label="Date limite de retour" /></label></div>
                <div className="stock-edit-inline"><select value={draftEdit.statut} onChange={(event) => setDraftEdit((current) => ({ ...current, statut: event.target.value as Status }))}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="sold-price"><span>€</span><input type="number" min="0" step="0.01" value={draftEdit.prix_revente} onChange={(event) => setDraftEdit((current) => ({ ...current, prix_revente: event.target.value }))} aria-label="Prix de revente" /></label></div>
                <ChecklistFields checklist={draftEdit.checklist} onChange={(key, checked) => setDraftEdit((current) => ({ ...current, checklist: { ...current.checklist, [key]: checked } }))} />
                <div className="stock-edit-actions"><button className="secondary-button" onClick={() => setEditingSku(null)}>Annuler</button><button className="primary-button" onClick={saveEditedListing}>Enregistrer</button></div>
              </div> : <>
                <div className="stock-item"><span className="stock-item-icon"><Box className="size-4" /></span><div><span className="sku-tag">{entry.sku_id}</span><h3>{entry.marque} {entry.modele}</h3><p>{entry.categorie} · Taille {entry.taille}{entry.emplacement ? ` · ${entry.emplacement}` : ""}{entry.statut === "EN_LIGNE" && entry.date_publication ? ` · En ligne depuis ${daysSince(entry.date_publication, referenceTime)} j` : ""}</p>{entry.fournisseur && <small>Achat : {entry.fournisseur}{entry.date_achat ? ` · ${entry.date_achat}` : ""}{entry.date_limite_retour ? ` · Retour avant ${entry.date_limite_retour}` : ""}</small>}</div></div>
                <div className="stock-finance"><span>CTA <b>{euro(entry.cta_ttc)}</b></span><span>Revente <b className={entry.prix_revente < entry.prix_min_x2 ? "text-red-300" : "green-text"}>{euro(entry.prix_revente)}</b></span>{entry.statut === "VENDU" && Number.isFinite(entry.prix_vendu) && <span>Net {Number.isFinite(entry.frais_reels) ? "réel" : "estimé"}<b className={(netProfit(entry) ?? 0) < 0 ? "text-red-300" : "green-text"}>{euro(netProfit(entry) ?? 0)}</b></span>}</div>
                {entry.statut === "EN_LIGNE" && daysSince(entry.date_publication, referenceTime) >= 14 && <div className="stagnant-alert"><span>Suggestion -5 % : <b>{euro(Math.max(1, Math.floor(entry.prix_revente * 0.95)))}</b>{Math.floor(entry.prix_revente * 0.95) < entry.prix_min_x2 ? <small> · sous le seuil x2</small> : null}</span><button className="secondary-button small-button" onClick={() => applyPriceSuggestion(entry)}>Appliquer</button><button className="secondary-button small-button" onClick={() => markRelisted(entry)}>Remise en ligne effectuée</button></div>}
                <div className="stock-actions"><select aria-label={`Statut de ${entry.sku_id}`} value={entry.statut} onChange={(event) => changeListingStatus(entry, event.target.value as Status)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{entry.statut === "VENDU" && <><label className="sold-price"><span>€</span><input type="number" min="0" step="0.01" placeholder="Encaissé" value={entry.prix_vendu ?? ""} onChange={(event) => updateListing(entry.sku_id, { prix_vendu: event.target.value === "" ? undefined : Number(event.target.value) })} aria-label="Prix réellement encaissé" /></label><label className="sold-price"><span>€</span><input type="number" min="0" step="0.01" placeholder="Frais réels" value={entry.frais_reels ?? ""} onChange={(event) => updateListing(entry.sku_id, { frais_reels: event.target.value === "" ? undefined : Number(event.target.value) })} aria-label="Frais réels hors achat" /></label></>}<label className="receipt-button"><FileText className="size-3.5" /><span>{entry.justificatif_nom || "Justificatif"}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPurchaseReceipt(entry.sku_id, file); event.currentTarget.value = ""; }} aria-label="Ajouter un justificatif d'achat" /></label>{entry.justificatif_url && <button className="text-link" type="button" onClick={() => void openReceipt(entry.justificatif_url!)}>Voir le reçu</button>}<button className="secondary-button small-button" onClick={() => startEditing(entry)}>Modifier</button><button className="danger-button" onClick={() => deleteListing(entry.sku_id)}>Supprimer</button><CopyButton text={`${entry.titre_seo}\n\n${entry.description}\n\n${entry.hashtags}`} field={entry.sku_id} copied={copied} onCopy={copyText} label="Copier" /></div>
                <details className="stock-checklist"><summary>Checklist {CHECKLIST_ITEMS.filter(({ key }) => entry.checklist?.[key]).length}/5</summary><ChecklistFields checklist={entry.checklist || emptyChecklist()} onChange={(key, checked) => updateChecklistItem(entry.sku_id, key, checked)} /></details>
              </>}</article>)}</div> : <div className="empty-stock"><Clipboard className="size-6" /><strong>{history.length ? "Aucun résultat pour ces filtres." : "Aucun article dans le stock."}</strong><span>Les annonces générées apparaîtront ici automatiquement.</span>{!history.length && <button className="text-link" onClick={() => setView("pipeline")}>Créer un premier article <ArrowRight className="size-3.5" /></button>}</div>}
            <div className="stock-footnote"><span><ShieldCheck className="size-3.5" /> Historique conservé dans le stockage local de ce navigateur</span><span>Rentabilité réalisée : <b className={globalProfit < 0 ? "text-red-300" : "green-text"}>{euro(globalProfit)}</b></span></div>
          </section>
        ) : view === "analytics" ? (
          <section className="panel analytics-panel">
            <div className="stock-heading"><div><span className="step-label">PERFORMANCE COMMERCIALE</span><h2>Analyses de ventes</h2><p>Calculées à partir des données de ton stock</p></div></div>
            <div className="analytics-metrics"><article><span>Profit net réalisé</span><strong className={globalProfit < 0 ? "text-red-300" : "green-text"}>{euro(globalProfit)}</strong><small>{estimatedFeeCount ? "inclut des frais estimés" : "frais réels renseignés"}</small></article><article><span>Articles vendus</span><strong>{soldEntries.length}</strong><small>sur {history.length} articles suivis</small></article><article><span>Taux d&apos;écoulement</span><strong>{sellThroughRate}%</strong><small>part du stock déjà vendue</small></article><article><span>Délai moyen de vente</span><strong>{averageDaysToSale === null ? "—" : `${averageDaysToSale} j`}</strong><small>{saleDurations.length} ventes datées</small></article></div>
            <div className="category-performance"><div className="checklist-heading"><span>PERFORMANCE PAR CATÉGORIE</span><strong>{categoryPerformance.length} catégories</strong></div>{categoryPerformance.length ? categoryPerformance.map((category) => <div className="category-row" key={category.name}><span>{category.name}</span><small>{category.count} article{category.count > 1 ? "s" : ""}</small><b className={category.profit < 0 ? "text-red-300" : "green-text"}>{euro(category.profit)}</b></div>) : <p>Aucune donnée de vente pour le moment.</p>}</div>
          </section>
        ) : view === "vinted_live" ? (
          <section className="vinted-live-layout">
            <div className="panel vinted-live-panel">
              <div className="stock-heading">
                <div>
                  <span className="step-label">VINTED LIVE DESK</span>
                  <h2>Ventes en Direct & Dressing Vinted</h2>
                  <p>Suivez vos ventes, encaissements et préparez les envois sans quitter le cockpit.</p>
                </div>
                <div className="heading-actions">
                  <a
                    href={getVintedDressingUrl(vintedUsername)}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button"
                  >
                    <ExternalLink className="size-4" /> Voir mon Dressing Vinted
                  </a>
                </div>
              </div>

              {/* Dressing Connection & Direct Links */}
              <div className="vinted-dressing-bar">
                <div className="vinted-dressing-input">
                  <Tag className="size-4 text-emerald-400 shrink-0" />
                  <input
                    type="text"
                    value={vintedUsername}
                    onChange={(e) => handleVintedUsernameChange(e.target.value)}
                    placeholder="URL directe de ton dressing ou ID Vinted (laisser vide = redirection automatique /closet)"
                    title="URL de votre dressing ou identifiant Vinted"
                  />
                </div>
                <div className="vinted-dressing-links">
                  <a
                    href="https://www.vinted.fr/my-account/orders"
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button !h-8 !text-[10px]"
                  >
                    📦 Mes Commandes & Ventes
                  </a>
                  <a
                    href="https://www.vinted.fr/inbox"
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button !h-8 !text-[10px]"
                  >
                    💬 Messages & Ventes Vinted
                  </a>
                  <a
                    href="https://www.vinted.fr/wallet"
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button !h-8 !text-[10px]"
                  >
                    💳 Mon Porte-monnaie Vinted
                  </a>
                </div>
              </div>

              {/* Live KPI Grid */}
              <div className="vinted-live-grid">
                <article>
                  <span>Articles Vendus</span>
                  <strong>{history.filter((i) => i.statut === "VENDU").length}</strong>
                  <small>sur {history.length} pièces au total</small>
                </article>
                <article>
                  <span>CA Encaissé</span>
                  <strong className="text-emerald-400">
                    {euro(
                      history
                        .filter((i) => i.statut === "VENDU")
                        .reduce((acc, i) => acc + (i.prix_vendu || i.prix_revente || 0), 0)
                    )}
                  </strong>
                  <small>total des ventes cumulées</small>
                </article>
                <article>
                  <span>Bénéfice Net Réalisé</span>
                  <strong className={globalProfit < 0 ? "text-red-300" : "text-emerald-400"}>
                    {euro(globalProfit)}
                  </strong>
                  <small>marge nette après coûts d&apos;achat</small>
                </article>
                <article>
                  <span>Articles en Ligne Actifs</span>
                  <strong className="text-blue-400">
                    {history.filter((i) => i.statut === "EN_LIGNE").length}
                  </strong>
                  <small>visibles actuellement sur Vinted</small>
                </article>
              </div>

              {/* Navigation Tabs */}
              <div className="vinted-live-tabs">
                <button
                  type="button"
                  className={`vinted-live-tab-btn ${vintedLiveTab === "sales" ? "active" : ""}`}
                  onClick={() => setVintedLiveTab("sales")}
                >
                  <PackageCheck className="size-3.5" />
                  Articles Vendus ({history.filter((i) => i.statut === "VENDU").length})
                </button>
                <button
                  type="button"
                  className={`vinted-live-tab-btn ${vintedLiveTab === "online" ? "active" : ""}`}
                  onClick={() => setVintedLiveTab("online")}
                >
                  <Tag className="size-3.5 text-blue-400" />
                  Articles en Ligne ({history.filter((i) => i.statut === "EN_LIGNE").length})
                </button>
                <button
                  type="button"
                  className={`vinted-live-tab-btn ${vintedLiveTab === "import" ? "active" : ""}`}
                  onClick={() => setVintedLiveTab("import")}
                >
                  <Sparkles className="size-3.5 text-amber-400" />
                  Enregistrer une Vente Express
                </button>
              </div>

              {/* Tab 1: Articles Vendus */}
              {vintedLiveTab === "sales" && (
                <div>
                  {history.filter((i) => i.statut === "VENDU").length ? (
                    history
                      .filter((i) => i.statut === "VENDU")
                      .map((item) => (
                        <div className="vinted-sold-card" key={item.sku_id}>
                          <div className="vinted-sold-info">
                            <div className="flex items-center gap-2">
                              <span className="sku-tag">{item.sku_id}</span>
                              <strong>
                                {item.marque} {item.modele}
                              </strong>
                              <span className="vinted-sold-badge">✓ VENDU</span>
                            </div>
                            <span>
                              Taille : {item.taille || "N/A"} · Acheté {euro(item.cta_ttc)} · Encaissé :{" "}
                              <b className="text-emerald-400">{euro(item.prix_vendu || item.prix_revente)}</b>
                              {item.date_vente && ` · Vendu le ${new Date(item.date_vente).toLocaleDateString("fr-FR")}`}
                            </span>
                          </div>
                          <div className="vinted-sold-actions">
                            <span className="font-mono text-xs font-bold text-emerald-400">
                              + {euro((item.prix_vendu || item.prix_revente) - item.cta_ttc - (item.frais_reels || 0))} net
                            </span>
                            <button
                              type="button"
                              className="secondary-button !h-8 !text-[10px]"
                              onClick={() => {
                                setView("labels");
                                setQuery(item.sku_id);
                              }}
                              title="Imprimer l'étiquette QR ou préparer le bordereau"
                            >
                              <Printer className="size-3.5" /> Bordereau
                            </button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="empty-stock">
                      <Clipboard className="size-6" />
                      <strong>Aucune vente enregistrée pour le moment.</strong>
                      <span>Dès qu&apos;un article en ligne est vendu, marquez-le en 1 clic pour suivre vos gains.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Articles Actuellement en Ligne */}
              {vintedLiveTab === "online" && (
                <div>
                  {history.filter((i) => i.statut === "EN_LIGNE").length ? (
                    history
                      .filter((i) => i.statut === "EN_LIGNE")
                      .map((item) => (
                        <div className="vinted-sold-card" key={item.sku_id}>
                          <div className="vinted-sold-info">
                            <div className="flex items-center gap-2">
                              <span className="sku-tag">{item.sku_id}</span>
                              <strong>
                                {item.marque} {item.modele}
                              </strong>
                              <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                EN LIGNE SUR VINTED
                              </span>
                            </div>
                            <span>
                              Taille : {item.taille || "N/A"} · Prix affiché : <b>{euro(item.prix_affiche || item.prix_revente)}</b> · Prix min : {euro(item.prix_min_x2)}
                            </span>
                          </div>
                          <div className="vinted-sold-actions">
                            <button
                              type="button"
                              className="primary-button !h-8 !text-[10px] !bg-emerald-600 hover:!bg-emerald-500"
                              onClick={() => {
                                const saleAmount = prompt(
                                  `Montant réellement encaissé pour ${item.sku_id} (€) :`,
                                  String(item.market_verdict?.prix_affiche_recommande ?? item.prix_revente ?? item.prix_affiche)
                                );
                                if (saleAmount && !isNaN(Number(saleAmount))) {
                                  recordLiveSale(item.sku_id, Number(saleAmount));
                                }
                              }}
                              title="Marquer comme vendu dès qu'une commande est confirmée"
                            >
                              ⚡ Noter Vendu
                            </button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="empty-stock">
                      <Tag className="size-6 text-zinc-500" />
                      <strong>Aucun article actuellement marqué &quot;En ligne&quot;.</strong>
                      <span>Passez vos articles prêts au statut &quot;En ligne&quot; dans l&apos;inventaire.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Enregistrer une Vente via Copier-Coller / Notification */}
              {vintedLiveTab === "import" && (
                <div className="vinted-import-box">
                  <div>
                    <strong className="text-xs text-zinc-200">Coller la notification ou l&apos;email de vente Vinted :</strong>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Exemple : &quot;Félicitations ! Vous avez vendu Veste Carhartt pour 45.00 € à pierre_vinted.&quot; L&apos;IA détecte automatiquement l&apos;article et enregistre la vente dans votre comptabilité.
                    </p>
                  </div>
                  <textarea
                    className="vinted-import-textarea"
                    placeholder="Collez ici le texte de votre vente Vinted..."
                    value={vintedImportText}
                    onChange={(e) => setVintedImportText(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleVintedSaleImport}
                      disabled={!vintedImportText.trim()}
                    >
                      <Sparkles className="size-3.5" /> Enregistrer la vente automatiquement
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="labels-layout">
            <div className="panel labels-panel">
              <div className="stock-heading"><div><span className="step-label">IDENTIFICATION PHYSIQUE</span><h2>Étiquettes QR</h2><p>Le SKU reste imprimé sous le QR, lisible sans téléphone.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => setScannerOpen(true)}><ScanLine className="size-4" /> Scanner</button><button className="primary-button" onClick={() => window.print()} disabled={!filteredHistory.length}><Printer className="size-4" /> Imprimer les étiquettes</button></div></div>
              <div className="stock-controls"><label className="search-box"><Search className="size-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer par SKU, marque..." /></label><span className="sync-indicator"><MapPin className="size-3.5" /> {filteredHistory.filter((entry) => entry.emplacement).length} avec emplacement</span></div>
              <div className="qr-label-grid">{filteredHistory.map((entry) => <article className="qr-label" key={entry.sku_id}><QRCodeSVG value={entry.sku_id} size={74} level="M" /><div><strong>{entry.sku_id}</strong><span>{entry.marque} {entry.modele}</span><small>{entry.emplacement || "Emplacement à noter"}</small></div></article>)}</div>
            </div>
            <div className="panel shipping-panel">
              <div className="panel-heading"><div><span className="step-label">BORDEREAU D&apos;EXPÉDITION</span><h2>Préparer une étiquette 100 × 150</h2></div><span className="panel-heading-icon"><FileText className="size-4" /></span></div>
              <label className="upload-zone shipping-upload" htmlFor="shipping-label-file"><input id="shipping-label-file" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.currentTarget.files || []); if (files.length) void loadShippingLabels(files); event.currentTarget.value = ""; }} /><span className="upload-icon"><Upload className="size-5" /></span><strong>Ajouter plusieurs bordereaux</strong><span>PDF, JPG, PNG ou WebP · 20 Mo maximum par fichier</span></label>
              {activeShippingLabel && (
                <>
                  <div className="shipping-batch-header">
                    <span>Bordereau {activeShippingIndex + 1}/{shippingLabels.length} · {activeShippingLabel.name}</span>
                    <div>
                      <button className="icon-action" disabled={activeShippingIndex === 0} onClick={() => setActiveShippingIndex((index) => index - 1)} aria-label="Bordereau précédent">
                        <ArrowRight className="size-4 rotate-180" />
                      </button>
                      <button className="icon-action" disabled={activeShippingIndex >= shippingLabels.length - 1} onClick={() => setActiveShippingIndex((index) => index + 1)} aria-label="Bordereau suivant">
                        <ArrowRight className="size-4" />
                      </button>
                      <button className="icon-action" onClick={() => { const next = shippingLabels.filter((label) => label.id !== activeShippingLabel.id); setShippingLabels(next); setActiveShippingIndex(Math.max(0, Math.min(activeShippingIndex, next.length - 1))); }} aria-label="Retirer ce bordereau">
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* Auto-Crop Presets Bar */}
                  <div className="shipping-presets-bar">
                    <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="size-3.5" /> Auto-Crop Transporteur :
                    </span>
                    <div className="carrier-presets-list">
                      <button
                        type="button"
                        className={`carrier-pill ${carrierPreset === "auto" ? "active" : ""}`}
                        onClick={() => applyCarrierPreset("auto")}
                        title="Détecter automatiquement l'emplacement de l'étiquette"
                      >
                        🎯 Auto-Détecter
                      </button>
                      <button
                        type="button"
                        className={`carrier-pill ${carrierPreset === "mondial" ? "active" : ""}`}
                        onClick={() => applyCarrierPreset("mondial")}
                        title="Bordereau Mondial Relay Vinted (Tout à droite, haut)"
                      >
                        📦 Mondial Relay (Tout à droite)
                      </button>
                      <button
                        type="button"
                        className={`carrier-pill ${carrierPreset === "chronopost" ? "active" : ""}`}
                        onClick={() => applyCarrierPreset("chronopost")}
                        title="Bordereau Chronopost / Shop2Shop (Tout à droite, haut)"
                      >
                        ⚡ Chronopost (Tout à droite)
                      </button>
                      <button
                        type="button"
                        className={`carrier-pill ${carrierPreset === "colissimo" ? "active" : ""}`}
                        onClick={() => applyCarrierPreset("colissimo")}
                        title="Bordereau Colissimo / La Poste (Haut Centré)"
                      >
                        📮 Colissimo
                      </button>
                      <button
                        type="button"
                        className={`carrier-pill ${carrierPreset === "left" ? "active" : ""}`}
                        onClick={() => applyCarrierPreset("left")}
                        title="Fiche destinataire (Colonne de gauche)"
                      >
                        📄 Fiche Gauche
                      </button>
                      <button
                        type="button"
                        className={`carrier-pill ${carrierPreset === "full" ? "active" : ""}`}
                        onClick={() => applyCarrierPreset("full")}
                        title="Format brut complet"
                      >
                        📐 Plein format
                      </button>
                    </div>
                  </div>

                  <div className="shipping-cropper">
                    <Cropper
                      image={activeShippingLabel.image}
                      crop={activeShippingLabel.crop}
                      zoom={activeShippingLabel.zoom}
                      aspect={2 / 3}
                      onCropChange={(crop) => updateShippingLabel(activeShippingLabel.id, { crop })}
                      onZoomChange={(zoom) => updateShippingLabel(activeShippingLabel.id, { zoom })}
                      onCropComplete={(_, pixels) => updateShippingLabel(activeShippingLabel.id, { cropArea: pixels })}
                    />
                  </div>

                  {/* Barre d'ajustement rapide et rotation */}
                  <div className="cropper-nudge-bar">
                    <div className="nudge-group">
                      <span className="text-[9px] text-zinc-400 font-medium">Déplacer :</span>
                      <button type="button" className="nudge-btn" onClick={() => nudgeCrop(15, 0)} title="Déplacer vers la gauche">⬅️ Gauche</button>
                      <button type="button" className="nudge-btn" onClick={() => nudgeCrop(-15, 0)} title="Déplacer vers la droite">➡️ Droite</button>
                      <button type="button" className="nudge-btn" onClick={() => nudgeCrop(0, 15)} title="Déplacer vers le haut">⬆️ Haut</button>
                      <button type="button" className="nudge-btn" onClick={() => nudgeCrop(0, -15)} title="Déplacer vers le bas">⬇️ Bas</button>
                    </div>
                    <div className="nudge-group">
                      <span className="text-[9px] text-zinc-400 font-medium">Zoom :</span>
                      <button type="button" className="nudge-btn" onClick={() => nudgeCrop(0, 0, 0.1)} title="Zoomer">➕</button>
                      <button type="button" className="nudge-btn" onClick={() => nudgeCrop(0, 0, -0.1)} title="Dézoomer">➖</button>
                      <button type="button" className="nudge-btn text-emerald-400" onClick={() => void rotateShippingLabel(activeShippingLabel.id)} title="Pivoter le bordereau de 90°">🔄 Tourner 90°</button>
                    </div>
                  </div>

                  <label className="zoom-control">
                    <span>Ajuster le cadrage manuel</span>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="0.05"
                      value={activeShippingLabel.zoom}
                      onChange={(event) => updateShippingLabel(activeShippingLabel.id, { zoom: Number(event.target.value) })}
                    />
                  </label>
                  <div className="shipping-actions">
                    <span>{shippingLabels.length} bordereau{shippingLabels.length > 1 ? "x" : ""} · A6 Thermique (100 × 150 mm)</span>
                    <div className="flex items-center gap-2">
                      <button className="primary-button" onClick={() => void printShippingLabelsThermal()} title="Imprimer directement sur imprimante thermique 100x150 mm">
                        <Printer className="size-4" /> Imprimer en Thermique A6
                      </button>
                      <button className="secondary-button" onClick={() => void exportShippingLabels()} title="Télécharger le fichier PDF 100x150 mm">
                        <ArrowDownToLine className="size-4" /> Exporter PDF
                      </button>
                    </div>
                  </div>
                </>
              )}
              {shippingError && <div className="alert-error"><ShieldAlert className="size-4 shrink-0" />{shippingError}</div>}
              <p className="privacy-note"><ShieldCheck className="size-3.5" /> Chaque bordereau cadré devient une page distincte. Pour un PDF source, sa première page est utilisée.</p>
            </div>
          </section>
        )}

        {scannerOpen && <div className="modal-backdrop" role="presentation"><section className="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="panel-heading"><div><span className="step-label">RECHERCHE DANS LE STOCK</span><h2 id="scanner-title">Scanner un SKU</h2></div><button className="icon-action" onClick={() => setScannerOpen(false)} aria-label="Fermer le scanner"><X className="size-4" /></button></div><QrScanner onScan={handleQrScan} /></section></div>}

        {/* Command Palette Universelle (Cmd + K) */}
        {cmdOpen && (
          <div
            className="cmd-k-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCmdOpen(false);
            }}
          >
            <div className="cmd-k-modal" role="dialog" aria-modal="true" aria-label="Palette de commandes">
              <div className="cmd-k-header">
                <Search className="size-4 text-emerald-400 shrink-0" />
                <input
                  type="text"
                  className="cmd-k-input"
                  placeholder="Rechercher un SKU, marque, modèle, action... (Échap pour fermer)"
                  value={cmdQuery}
                  onChange={(e) => setCmdQuery(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="icon-action text-zinc-400"
                  onClick={() => setCmdOpen(false)}
                  aria-label="Fermer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="cmd-k-results">
                {/* Navigation */}
                <div className="cmd-k-group-title">Navigation & Vues</div>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { setView("pipeline"); setMode("SEMAINE_ACHAT"); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <Zap className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Mode Semaine Achat (Saisie & estimation rapide)</span>
                  </div>
                  <span className="cmd-k-item-meta">Vue Achat</span>
                </button>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { setView("pipeline"); setMode("WEEKEND_SHOOTING"); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <ImagePlus className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Mode Weekend Shooting (Photos 12 angles & checklist)</span>
                  </div>
                  <span className="cmd-k-item-meta">Vue Shooting</span>
                </button>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { setView("pipeline"); setMode("SOURCING_CAPTURE"); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <Search className="size-3.5 text-amber-400 shrink-0" />
                    <span>Mode Arbitrage Sourcing (Capture d&apos;écran d&apos;annonce)</span>
                  </div>
                  <span className="cmd-k-item-meta">Vue Sourcing</span>
                </button>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { setView("stock"); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <Box className="size-3.5 text-blue-400 shrink-0" />
                    <span>Inventaire du stock ({history.length} article{history.length > 1 ? "s" : ""})</span>
                  </div>
                  <span className="cmd-k-item-meta">Vue Stock</span>
                </button>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { setView("labels"); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <Printer className="size-3.5 text-purple-400 shrink-0" />
                    <span>Étiquettes QR & Bordereaux d&apos;envoi 100×150</span>
                  </div>
                  <span className="cmd-k-item-meta">Vue Expédition</span>
                </button>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { setView("analytics"); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <TrendingUp className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Statistiques & Marges financières</span>
                  </div>
                  <span className="cmd-k-item-meta">Vue Analytics</span>
                </button>

                {/* Actions Rapides */}
                <div className="cmd-k-group-title">Actions Rapides</div>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { setScannerOpen(true); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <ScanLine className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Scanner un QR Code SKU (Caméra)</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { exportCsv(); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <ArrowDownToLine className="size-3.5 text-blue-400 shrink-0" />
                    <span>Exporter l&apos;inventaire en fichier CSV</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="cmd-k-item"
                  onClick={() => { setAiModalOpen(true); setCmdOpen(false); }}
                >
                  <div className="cmd-k-item-left">
                    <Sparkles className="size-3.5 text-amber-400 shrink-0" />
                    <span>Configurer le moteur IA Cloud</span>
                  </div>
                </button>

                {/* Articles du stock filtrés */}
                {history.length > 0 && (
                  <>
                    <div className="cmd-k-group-title">
                      Articles du Stock {cmdQuery ? `(résultats pour "${cmdQuery}")` : ""}
                    </div>
                    {history
                      .filter((item) => {
                        if (!cmdQuery.trim()) return true;
                        const q = cmdQuery.toLowerCase();
                        return (
                          item.sku_id.toLowerCase().includes(q) ||
                          item.marque.toLowerCase().includes(q) ||
                          item.modele.toLowerCase().includes(q) ||
                          item.taille.toLowerCase().includes(q) ||
                          item.statut.toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 8)
                      .map((item) => (
                        <button
                          key={item.sku_id}
                          type="button"
                          className="cmd-k-item"
                          onClick={() => {
                            setResult(item);
                            setView("pipeline");
                            setCmdOpen(false);
                            toast.success(`Article ${item.sku_id} ouvert`);
                          }}
                        >
                          <div className="cmd-k-item-left">
                            <Tag className="size-3.5 text-zinc-400 shrink-0" />
                            <div className="flex flex-col text-left">
                              <span className="font-semibold text-zinc-200">
                                {item.sku_id} · {item.marque} {item.modele}
                              </span>
                              <span className="text-[10px] text-zinc-400">
                                Taille : {item.taille || "N/A"} · {item.statut}
                              </span>
                            </div>
                          </div>
                          <div className="cmd-k-item-meta">
                            <strong className="text-emerald-400 font-mono text-xs">
                              {euro(item.market_verdict?.prix_affiche_recommande ?? item.prix_revente ?? item.prix_affiche)}
                            </strong>
                          </div>
                        </button>
                      ))}
                  </>
                )}
              </div>

              <div className="cmd-k-footer">
                <span>Astuce : Naviguez avec les flèches ou la souris · Clic pour ouvrir</span>
                <span className="font-mono">Échap pour fermer</span>
              </div>
            </div>
          </div>
        )}

        {aiModalOpen && (
          <div className="modal-backdrop" role="presentation">
            <section className="ai-config-modal panel" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
              <div className="panel-heading">
                <div>
                  <span className="step-label">MOTEUR INTELLIGENCE ARTIFICIELLE</span>
                  <h2 id="ai-modal-title">Configuration IA Cloud</h2>
                </div>
                <button
                  className="icon-action"
                  type="button"
                  onClick={() => { setAiModalOpen(false); setAiFeedback(null); setAiTestResult({ status: "idle", message: "" }); }}
                  aria-label="Fermer la configuration IA"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="ai-status-box">
                <div>
                  <span className="text-xs text-gray-400">Fournisseur actif :</span>
                  <strong>{aiStatus?.activeProviderLabel || "Aucun moteur configuré"}</strong>
                  <small className={aiStatus?.ready && !aiStatus?.localOnlyWarning ? "green-text" : "text-amber-400"}>
                    {aiStatus?.ready
                      ? (aiStatus.localOnlyWarning ? "⚠ Mode local OmniRoute (inaccessible hors de votre machine)" : "✓ Prêt pour l'analyse sur le site déployé")
                      : "⚠ Aucune clé Cloud configurée"}
                  </small>
                </div>
                <span className={`status ${aiStatus?.ready && !aiStatus?.localOnlyWarning ? "status-ready" : "status-pending"}`}>
                  {aiStatus?.ready && !aiStatus?.localOnlyWarning ? "Actif" : "À configurer"}
                </span>
              </div>

              <p className="ai-modal-copy">
                Pour que l&apos;analyse photo et la rédaction des annonces fonctionnent pour tout le monde <strong>même avec le site déployé</strong>, vous pouvez soit renseigner une clé Cloud sur votre compte ci-dessous, soit configurer <code>GEMINI_API_KEY</code> sur Vercel.
              </p>

              <div className="ai-form-fields">
                <label htmlFor="ai-provider-select">Fournisseur d&apos;IA</label>
                <select
                  id="ai-provider-select"
                  className="ai-select"
                  value={aiProvider}
                  onChange={(e) => {
                    setAiProvider(e.target.value as AiProviderType);
                    setAiFeedback(null);
                    setAiTestResult({ status: "idle", message: "" });
                  }}
                >
                  {Object.entries(AI_PROVIDERS).map(([key, info]) => (
                    <option key={key} value={key}>{info.label}</option>
                  ))}
                </select>
                <p className="ai-helper-note">{AI_PROVIDERS[aiProvider]?.desc}</p>

                {aiProvider !== "omniroute" && (
                  <>
                    <div className="flex items-center justify-between mt-2">
                      <label htmlFor="ai-api-key">
                        Clé API {aiProvider === "auto" ? "Cloud (Optionnel)" : AI_PROVIDERS[aiProvider]?.label}
                      </label>
                      {AI_PROVIDERS[aiProvider]?.keyUrl && (
                        <a
                          href={AI_PROVIDERS[aiProvider].keyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link flex items-center gap-1 text-xs"
                        >
                          <ExternalLink className="size-3" /> Obtenir une clé {aiProvider === "gemini" ? "gratuite" : ""}
                        </a>
                      )}
                    </div>
                    <input
                      id="ai-api-key"
                      className="ai-input"
                      type="password"
                      autoComplete="off"
                      placeholder={aiStatus?.savedConfig.hasApiKey ? `Clé enregistrée (${aiStatus.savedConfig.maskedApiKey})` : (AI_PROVIDERS[aiProvider]?.placeholder || "Colle ta clé API ici")}
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                    />
                    {aiStatus?.savedConfig.hasApiKey && !aiApiKey && (
                      <p className="ai-helper-note text-emerald-400">
                        ✓ Une clé est déjà enregistrée sur votre compte ({aiStatus.savedConfig.maskedApiKey}). Saisissez une nouvelle clé pour la remplacer.
                      </p>
                    )}
                  </>
                )}

                {aiProvider === "omniroute" && (
                  <>
                    <label htmlFor="omniroute-url" className="mt-2">URL OmniRoute</label>
                    <input
                      id="omniroute-url"
                      className="ai-input"
                      type="text"
                      placeholder="Ex: https://mon-omniroute.com/v1 ou http://localhost:20128/v1"
                      value={aiOmnirouteUrl}
                      onChange={(e) => setAiOmnirouteUrl(e.target.value)}
                    />
                    <p className="ai-helper-note">
                      Sur le site déployé (Vercel), l&apos;URL doit être publique (ex: tunnel Cloudflare ou VPS). <code>localhost</code> ne fonctionne qu&apos;en local sur votre propre machine.
                    </p>
                    <label htmlFor="omniroute-key" className="mt-2">Clé API OmniRoute</label>
                    <input
                      id="omniroute-key"
                      className="ai-input"
                      type="password"
                      placeholder="sk-xxxxxxxxxxxxxxxx"
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                    />
                  </>
                )}

                <details className="ai-advanced-details">
                  <summary>Modèles personnalisés (avancé)</summary>
                  <div className="ai-advanced-grid">
                    <label>
                      <span>Modèle Vision</span>
                      <input
                        className="ai-input"
                        placeholder="Ex: gemini-2.0-flash"
                        value={aiVisionModel}
                        onChange={(e) => setAiVisionModel(e.target.value)}
                      />
                    </label>
                    <label>
                      <span>Modèle Rédaction</span>
                      <input
                        className="ai-input"
                        placeholder="Ex: auto/claude-sonnet"
                        value={aiCopyModel}
                        onChange={(e) => setAiCopyModel(e.target.value)}
                      />
                    </label>
                  </div>
                </details>
              </div>

              {aiTestResult.status !== "idle" && (
                <div className={`mt-3 p-3 rounded text-xs flex items-center gap-2 ${aiTestResult.status === "testing" ? "bg-zinc-800 text-zinc-300" : aiTestResult.status === "success" ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300" : "bg-red-950/60 border border-red-800 text-red-300"}`}>
                  {aiTestResult.status === "testing" ? <RefreshCw className="size-4 animate-spin shrink-0" /> : aiTestResult.status === "success" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-400" /> : <ShieldAlert className="size-4 shrink-0 text-red-400" />}
                  <span>{aiTestResult.message}</span>
                </div>
              )}

              {aiFeedback && (
                <div className={`mt-3 p-3 rounded text-xs flex items-center gap-2 ${aiFeedback.type === "success" ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300" : "bg-red-950/60 border border-red-800 text-red-300"}`}>
                  {aiFeedback.type === "success" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-400" /> : <ShieldAlert className="size-4 shrink-0 text-red-400" />}
                  <span>{aiFeedback.text}</span>
                </div>
              )}

              <div className="ai-modal-actions">
                {aiStatus?.savedConfig.hasApiKey && (
                  <button
                    type="button"
                    className="danger-button mr-auto"
                    disabled={aiPending}
                    onClick={() => void saveAiConfiguration(true)}
                  >
                    Supprimer ma clé
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={aiPending || aiTestResult.status === "testing"}
                  onClick={() => void testAiConnection()}
                >
                  {aiTestResult.status === "testing" ? <RefreshCw className="size-4 animate-spin" /> : <Zap className="size-4" />}
                  Tester la connexion
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={aiPending}
                  onClick={() => void saveAiConfiguration(false)}
                >
                  {aiPending ? <RefreshCw className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
                  Enregistrer sur mon compte
                </button>
              </div>
            </section>
          </div>
        )}

        <footer className="app-footer"><span>VINTED COO <span>·</span> PRIVATE INVENTORY DESK</span><span>Les recommandations IA sont indicatives. Authentifiez et vérifiez chaque article avant publication.</span></footer>
      </div>
    </main>
  );
}