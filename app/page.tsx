"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Cropper from "react-easy-crop";
import type { Html5Qrcode as Html5QrcodeInstance } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import "react-easy-crop/react-easy-crop.css";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, Barcode, Box, CalendarDays, Check, CheckCircle2, Clipboard, Clock3,
  Copy, FileText, ImagePlus, LockKeyhole, LogOut, Mail, MapPin, PackageCheck, Plus, Printer, RefreshCw,
  ScanLine, Search, ShieldAlert, ShieldCheck, Sparkles, Tag, TrendingUp, Upload, Wallet, X, Zap,
} from "lucide-react";

type Mode = "SEMAINE_ACHAT" | "WEEKEND_SHOOTING";
type Status = "EN_TRANSIT" | "A_COMPLETER" | "PRET_A_PUBLIER" | "EN_LIGNE" | "VENDU";
type Photo = { dataUrl: string; angle: string; name: string };
type Checklist = { size: boolean; condition: boolean; material: boolean; photos: boolean; authenticity: boolean };
type MarketSnapshot = { average: number | null; min: number | null; max: number | null; count: number; observed_at: string; source: string };
type ShippingLabel = { id: string; name: string; image: string; crop: { x: number; y: number }; zoom: number; cropArea: { x: number; y: number; width: number; height: number } | null };
type Listing = {
  sku_id: string; marque: string; modele: string; categorie: string; taille: string; etat: string;
  caracteristiques: string[]; mesures: Record<string, string | number> | null;
  authenticite: { niveau: string; indices: string[] }; confiance: number; prix_achat: number;
  cta_ttc: number; prix_min_x2: number; prix_affiche: number; prix_revente: number; marge_negociation_pct: number;
  creneau_publi: string; created_at?: string; statut: Status; titre_seo: string; description: string; hashtags: string;
  message_nego: string; sync_sheet: boolean; prix_vendu?: number; frais_reels?: number;
  checklist?: Checklist; market?: MarketSnapshot; date_publication?: string; date_vente?: string;
  emplacement?: string; fournisseur?: string; date_achat?: string; date_limite_retour?: string;
  justificatif_nom?: string; justificatif_url?: string; updated_at?: string;
};

const HISTORY_KEY = "vinted-coo-stock-v1";
function localHistoryKey(userId: string) {
  return `${HISTORY_KEY}:${userId}`;
}

function readLocalHistory(userId: string): Listing[] {
  try {
    const stored = JSON.parse(localStorage.getItem(localHistoryKey(userId)) || "[]") as Listing[];
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
const PHOTO_ANGLES = ["Vue globale", "Étiquette / marque", "Coutures / détails"];

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value || 0);
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

function computeResalePrice(prixAchat: number, prixAffiche: number, prixMinX2: number) {
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

function CopyButton({ text, field, copied, onCopy, label = "Copier" }: {
  text: string; field: string; copied: string | null; onCopy: (text: string, field: string) => void; label?: string;
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
  onChange: (key: keyof Checklist, checked: boolean) => void;
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

function QrScanner({ onScan }: { onScan: (value: string) => void }) {
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
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authPending, setAuthPending] = useState(false);
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"pipeline" | "stock" | "analytics" | "labels">("pipeline");
  const [filter, setFilter] = useState<Status | "TOUT">("TOUT");
  const [query, setQuery] = useState("");
  const [syncState, setSyncState] = useState("Synchronisation en attente");
  const [shippingLabels, setShippingLabels] = useState<ShippingLabel[]>([]);
  const [activeShippingIndex, setActiveShippingIndex] = useState(0);
  const [shippingError, setShippingError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const supabaseRef = useRef<SupabaseClient | null>(null);

  async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
    const client = supabaseRef.current;
    if (!client) throw new Error("Le client Supabase n'est pas initialisé.");
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError || !data.session) throw new Error("Connecte-toi pour continuer.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
    return fetch(input, { ...init, headers });
  }

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};

    async function initializeAuth() {
      try {
        const client = getSupabaseBrowserClient();
        supabaseRef.current = client;
        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
          setUnlocked(Boolean(session));
          setUserId(session?.user.id || "");
          setSignedInEmail(session?.user.email || "");
          if (!session) setHistory([]);
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
    if (!loading) {
      setProgress(0);
      return;
    }

    setProgress(8);
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
    tick();

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
      const payload = await response.json() as { stock: Listing[] };
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

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthPending(true);
    try {
      const client = supabaseRef.current;
      if (!client) throw new Error("Supabase n'est pas configuré.");
      const result = authMode === "sign-up"
        ? await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } })
        : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setAuthMessage("Compte créé. Consulte ta messagerie pour confirmer l'adresse e-mail.");
        return;
      }
      if (!result.data.user) throw new Error("Supabase n'a pas renvoyé le compte connecté.");
      const nextUserId = result.data.user.id;
      const stored = readLocalHistory(nextUserId);
      setHistory(stored);
      setUserId(nextUserId);
      setSignedInEmail(result.data.user.email || email.trim());
      setUnlocked(true);
      await synchronizeFromServer(stored, nextUserId);
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
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/")).slice(0, 8);
    if (!files.length) return;
    setError("");
    Promise.all(files.map(async (file, index) => ({
      dataUrl: await photoToDataUrl(file),
      angle: PHOTO_ANGLES[index] || `Détail ${index - 1}`,
      name: file.name,
    }))).then((newPhotos) => setPhotos(newPhotos)).catch((uploadError: Error) => setError(uploadError.message));
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
    return { id: crypto.randomUUID(), name: file.name, image: imageData, crop: { x: 0, y: 0 }, zoom: 1, cropArea: null };
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
    if (photos.length < 3) {
      setError("Ajoutez au minimum trois angles : vue globale, étiquette et détails.");
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
      const response = await apiFetch("/api/vinted-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: photos.map(({ dataUrl, angle }) => ({ dataUrl, angle })), prixAchat: prixAchat ? Number(prixAchat) : null, mode, skuId: skuPayload.skuId }),
      });
      const payload = await response.json() as { success: boolean; data?: Listing; error?: string; warning?: string };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || "Le pipeline n'a pas abouti.");
      setProgress(100);
      setResult(payload.data);
      persist([payload.data, ...history.filter((entry) => entry.sku_id !== payload.data!.sku_id)]);
      if (payload.warning) setNotice(payload.warning);
      else setNotice(payload.data.sync_sheet ? "Article ajouté au stock et synchronisé avec Google Sheets." : "Article ajouté au stock local.");
      window.setTimeout(() => setLoading(false), 700);
    } catch (pipelineError) {
      setProgress(0);
      setError(pipelineError instanceof Error ? pipelineError.message : "Erreur de connexion au pipeline.");
      setLoading(false);
    }
  }

  async function copyText(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Le presse-papiers est indisponible dans ce navigateur.");
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
      setError("Valide les cinq points de la checklist avant de marquer l'article comme prêt ou en ligne.");
      return;
    }
    setError("");
    updateListing(entry.sku_id, { statut: status });
  }

  function applyPriceSuggestion(entry: Listing) {
    const suggestedPrice = Math.max(1, Math.floor(entry.prix_revente * 0.95));
    updateListing(entry.sku_id, { prix_revente: suggestedPrice, prix_affiche: suggestedPrice });
    setNotice(`Prix de ${entry.sku_id} ajusté à ${euro(suggestedPrice)} (-5 %).`);
  }

  function markRelisted(entry: Listing) {
    updateListing(entry.sku_id, { statut: "EN_LIGNE", date_publication: new Date().toISOString() });
    setNotice(`${entry.sku_id} marqué comme remis en ligne.`);
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
  }

  const ctaPreview = prixAchat ? Number(prixAchat) * 1.05 + 4.2 : 0;
  const minPreview = ctaPreview * 2;
  const activeShippingLabel = shippingLabels[activeShippingIndex];

  if (!authReady) return <main className="auth-screen"><div className="auth-card"><RefreshCw className="size-5 animate-spin text-emerald-400" /><span>Initialisation du tableau de bord...</span></div></main>;
  if (!unlocked) return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="brand-mark"><Zap className="size-5 fill-current" /></div>
        <p className="eyebrow">VINTED COO <span>·</span> ESPACE PRIVÉ</p>
        <h1>{authMode === "sign-in" ? "Connexion à ton espace" : "Créer un compte"}</h1>
        <p className="auth-copy">Connecte-toi avec ton compte Supabase pour retrouver ton stock et tes étiquettes QR.</p>
        <form className="pin-form" onSubmit={authenticate}>
          <label htmlFor="account-email">Adresse e-mail</label>
          <div className="pin-input-wrap"><Mail className="size-4" /><input id="account-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required /></div>
          <label htmlFor="account-password">Mot de passe</label>
          <div className="pin-input-wrap"><LockKeyhole className="size-4" /><input id="account-password" type="password" autoComplete={authMode === "sign-up" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          {authError && <p className="inline-error">{authError}</p>}
          {authMessage && <p className="auth-copy">{authMessage}</p>}
          <button className="primary-button w-full" type="submit" disabled={authPending}>{authPending ? <RefreshCw className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}{authMode === "sign-in" ? "Se connecter" : "Créer mon compte"}<ArrowRight className="size-4 ml-auto" /></button>
        </form>
        <button className="text-link" type="button" onClick={() => { setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in"); setAuthError(""); setAuthMessage(""); }}>{authMode === "sign-in" ? "Créer un compte" : "J'ai déjà un compte"}</button>
        <div className="auth-foot"><ShieldCheck className="size-4" /> Connexion sécurisée par Supabase Auth</div>
      </section>
    </main>
  );

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Vinted COO accueil"><span className="brand-mark"><Zap className="size-4 fill-current" /></span><span>VINTED<span className="brand-muted"> / COO</span></span></a>
        <div className="topbar-center"><span className="live-dot" /> PIPELINE OPÉRATIONNEL <span className="topbar-divider">/</span> EUROPE · PARIS</div>
        <button className="icon-action lock-action" onClick={signOut} title="Se déconnecter" aria-label="Se déconnecter"><LogOut className="size-4" /><span>{signedInEmail || "Déconnexion"}</span></button>
      </header>

      <div className="dashboard-content" id="top">
        <section className="page-heading">
          <div><p className="eyebrow">COCKPIT DE REVENTE <span>·</span> {new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>Le stock, <span>sous contrôle.</span></h1><p className="heading-copy">Analysez, arbitrez et préparez vos prochaines annonces depuis un seul poste.</p></div>
          <div className="heading-actions"><span className="secure-pill"><ShieldCheck className="size-3.5" /> SESSION CHIFFRÉE</span><button className="primary-button" onClick={() => { setView("pipeline"); setResult(null); }}><Plus className="size-4" /> Nouvel article</button></div>
        </section>

        <section className="metrics-grid" aria-label="Indicateurs globaux">
          <article className="metric-tile"><span className="metric-icon green"><Wallet className="size-4" /></span><span className="metric-label">Capital engagé</span><strong>{euro(committedCapital)}</strong><small>En transit et prêt à publier</small></article>
          <article className="metric-tile"><span className="metric-icon blue"><TrendingUp className="size-4" /></span><span className="metric-label">Rentabilité réalisée</span><strong className={globalProfit < 0 ? "text-red-300" : ""}>{euro(globalProfit)}</strong><small>{estimatedFeeCount ? `${estimatedFeeCount} vente${estimatedFeeCount > 1 ? "s" : ""} avec frais estimés` : "Prix encaissé − achat − frais réels"}</small></article>
          <article className="metric-tile"><span className="metric-icon amber"><Box className="size-4" /></span><span className="metric-label">Rotation rapide</span><strong>{quickRotation.toString().padStart(2, "0")} <em>articles</em></strong><small>Prêts à publier · cible &lt; 14 jours</small></article>
          <article className="metric-tile metric-feature"><div><span className="metric-label">Fenêtre de publication</span><strong>VEN → DIM</strong><small>Créneaux recommandés uniquement</small></div><span className="metric-icon blue"><ShieldCheck className="size-4" /></span><div className="week-strip"><span>LU</span><span>MA</span><span>ME</span><span>JE</span><span className="active">VE</span><span className="active">SA</span><span className="active">DI</span></div></article>
        </section>

        <nav className="view-tabs" aria-label="Vues du tableau de bord">
          <button className={view === "pipeline" ? "selected" : ""} onClick={() => setView("pipeline")}><Sparkles className="size-4" /> Pipeline IA</button>
          <button className={view === "stock" ? "selected" : ""} onClick={() => setView("stock")}><PackageCheck className="size-4" /> Stock & historique <span className="tab-count">{history.length}</span></button>
          <button className={view === "analytics" ? "selected" : ""} onClick={() => setView("analytics")}><TrendingUp className="size-4" /> Analyses</button>
          <button className={view === "labels" ? "selected" : ""} onClick={() => setView("labels")}><Barcode className="size-4" /> Étiquettes</button>
          <span className="sync-indicator"><i />{syncState}</span>
        </nav>

        {view === "pipeline" ? (
          <section className="pipeline-layout">
            <div className="panel intake-panel">
              <div className="panel-heading"><div><span className="step-label">01 / INGESTION</span><h2>Nouvel article</h2></div><span className="panel-heading-icon"><ImagePlus className="size-4" /></span></div>
              <label className="field-label" htmlFor="photo-upload">Photos multi-angles <span>3 minimum · 8 maximum</span></label>
              <label htmlFor="photo-upload" className="upload-zone">
                <input id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple onChange={uploadPhotos} />
                {photos.length ? <><div className="photo-count"><ImagePlus className="size-4" />{photos.length} photo{photos.length > 1 ? "s" : ""} sélectionnée{photos.length > 1 ? "s" : ""}</div><div className="photo-grid">{photos.map((photo, index) => <div className="photo-preview" key={`${photo.name}-${index}`}><Image src={photo.dataUrl} alt={photo.angle} fill unoptimized sizes="(max-width: 600px) 28vw, 100px" /><span>{photo.angle}</span><button type="button" onClick={(event) => { event.preventDefault(); setPhotos(photos.filter((_, photoIndex) => photoIndex !== index)); }} aria-label={`Retirer ${photo.name}`}><X className="size-3" /></button></div>)}</div><span className="upload-again"><Plus className="size-3" /> Remplacer la sélection</span></> : <><span className="upload-icon"><Upload className="size-5" /></span><strong>Choisir les photos de l&apos;article</strong><span>JPG, PNG ou WebP · sélection multiple</span><div className="angle-chips">{PHOTO_ANGLES.map((angle, index) => <span key={angle}><i>{String(index + 1).padStart(2, "0")}</i>{angle}</span>)}</div></>}
              </label>
              <div className="field-row"><label className="field-label" htmlFor="purchase-price">Prix d&apos;achat <span>Facultatif, estimation IA sinon</span></label><div className="price-input"><span>€</span><input id="purchase-price" type="number" min="0" step="0.01" placeholder="À estimer" value={prixAchat} onChange={(event) => setPrixAchat(event.target.value)} /></div></div>
              <div className="field-label mode-title">Mode opératoire</div>
              <div className="mode-switch"><button onClick={() => setMode("SEMAINE_ACHAT")} className={mode === "SEMAINE_ACHAT" ? "active" : ""}><span className="mode-dot green-dot" /><span><b>Sourcing semaine</b><small>Négociation activée</small></span></button><button onClick={() => setMode("WEEKEND_SHOOTING")} className={mode === "WEEKEND_SHOOTING" ? "active" : ""}><span className="mode-dot blue-dot" /><span><b>Session week-end</b><small>Préparation publication</small></span></button></div>
              {prixAchat ? <div className="formula-preview"><div><span>CTA TTC estimé</span><strong>{euro(ctaPreview)}</strong></div><ArrowRight className="size-4" /><div><span>Prix minimum x2</span><strong>{euro(minPreview)}</strong></div></div> : <div className="formula-hint"><ShieldAlert className="size-4" /> Le prix d&apos;achat cible sera estimé à partir des photos.</div>}
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
              <button className="primary-button pipeline-submit" disabled={loading} onClick={runPipeline}>{loading ? <><RefreshCw className="size-4 animate-spin" /> Gemini analyse les photos · Claude rédige...</> : <><Zap className="size-4 fill-current" /> Lancer l&apos;analyse IA <ArrowRight className="size-4 ml-auto" /></>}</button>
              <p className="privacy-note"><LockKeyhole className="size-3" /> Photos transmises au modèle IA, non conservées dans l&apos;historique local.</p>
            </div>

            <div className="result-column">
              {result ? <>
                <div className="panel result-panel">
                  <div className="result-topline"><span className="step-label">02 / ARBITRAGE</span><span className={statusClass(result.statut)}><i />{STATUS_LABELS[result.statut]}</span></div>
                  <div className="result-product"><div><span className="product-brand">{result.marque}</span><h2>{result.modele}</h2><p>{result.categorie} <span>·</span> Taille {result.taille} <span>·</span> {result.etat}</p></div><div className="display-price"><small>PRIX DE REVENTE RÉEL</small><strong>{euro(result.prix_revente ?? result.prix_affiche)}</strong><span>{result.prix_revente < result.prix_min_x2 ? "Alerte : au-dessous du plancher x2" : "Compatible avec le plancher x2"}</span></div></div>
                  <div className="financial-grid"><div><span>Coût total d&apos;acquisition</span><strong>{euro(result.cta_ttc)}</strong><small>dont port & emballage</small></div><div><span>Plancher x2</span><strong className="green-text">{euro(result.prix_min_x2)}</strong><small>objectif de vente minimum</small></div><div><span>Prix réel conseillé</span><strong className="blue-text">{euro(result.prix_revente ?? result.prix_affiche)}</strong><small>prix à mettre sur Vinted</small></div></div>
                  <div className="roi-track"><div><span>RENDEMENT CIBLE SUR COÛT</span><b>{result.prix_revente < result.prix_min_x2 ? "⚠️ sous x2" : "×2 net minimum"}</b></div><div className="roi-bar"><span style={{ width: `${Math.min(100, (result.prix_revente / Math.max(result.prix_min_x2, 1)) * 100)}%` }} /></div></div>
                  {result.prix_revente < result.prix_min_x2 && <div className="alert-warning"><ShieldAlert className="size-4 shrink-0" />Le prix réel conseillé est inférieur au seuil x2. Tu peux le valider si le marché le justifie, mais il faudra le surveiller.</div>}
                  <div className="schedule-line"><span className="metric-icon blue"><ShieldCheck className="size-4" /></span><div><small>PROCHAIN CRÉNEAU OPSEC</small><strong>{result.creneau_publi}</strong></div><span className="sku-tag">{result.sku_id}</span></div>
                  <div className="authenticity-note"><BadgeCheck className="size-4" /><div><b>Contrôle visuel : {result.authenticite.niveau}</b><span>Une analyse photo ne certifie pas l&apos;authenticité. Vérification physique recommandée.</span></div></div>
                  <ChecklistFields checklist={result.checklist || emptyChecklist()} onChange={(key, checked) => updateChecklistItem(result.sku_id, key, checked)} />
                  {(result.caracteristiques.length > 0 || result.mesures) && <div className="item-facts"><span>OBSERVATIONS IA</span><p>{result.caracteristiques.join(" · ")}{result.mesures && ` · Mesures : ${Object.entries(result.mesures).map(([key, value]) => `${key} ${value}`).join(", ")}`}</p></div>}
                  <div className="market-snapshot">
                    <div className="checklist-heading"><span>COMPARABLES VINTED</span><strong>{result.market?.source === "vinted-live" ? `${result.market.count} annonces` : "Indisponible"}</strong></div>
                    {result.market?.source === "vinted-live" && result.market.count > 0 ? <p>{euro(result.market.min || 0)} – {euro(result.market.max || 0)} <span>· moyenne {euro(result.market.average || 0)}</span></p> : <p>Aucun prix comparable récupéré pour cette recherche.</p>}
                    {result.market?.observed_at && <small>Relevé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(result.market.observed_at))}</small>}
                  </div>
                </div>
                <div className="panel copy-panel">
                  <div className="panel-heading"><div><span className="step-label">03 / CONTENU</span><h2>{isChecklistComplete(result.checklist) ? "Annonce prête à publier" : "Annonce à vérifier"}</h2></div><span className="ai-badge"><Sparkles className="size-3" /> CLAUDE</span></div>
                  {mode === "SEMAINE_ACHAT" && result.message_nego && <div className="copy-block"><div className="copy-block-heading"><span>MESSAGE DE NÉGOCIATION</span><CopyButton text={result.message_nego} field="nego" copied={copied} onCopy={copyText} /></div><p>{result.message_nego}</p></div>}
                  <div className="copy-block"><div className="copy-block-heading"><span><Tag className="size-3.5" /> TITRE SEO</span><CopyButton text={result.titre_seo} field="title" copied={copied} onCopy={copyText} /></div><p className="listing-title">{result.titre_seo}</p></div>
                  <div className="copy-block"><div className="copy-block-heading"><span>DESCRIPTION & HASHTAGS</span><CopyButton text={`${result.description}\n\n${result.hashtags}`} field="description" copied={copied} onCopy={copyText} label="Tout copier" /></div><p className="listing-description">{result.description}<br /><br /><span>{result.hashtags}</span></p></div>
                  <div className="result-footer"><span><CheckCircle2 className="size-3.5" /> SKU ajouté à l&apos;historique local</span><button onClick={() => { setView("stock"); setFilter("TOUT"); }} className="text-link">Voir le stock <ArrowRight className="size-3.5" /></button></div>
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
              {activeShippingLabel && <><div className="shipping-batch-header"><span>Bordereau {activeShippingIndex + 1}/{shippingLabels.length} · {activeShippingLabel.name}</span><div><button className="icon-action" disabled={activeShippingIndex === 0} onClick={() => setActiveShippingIndex((index) => index - 1)} aria-label="Bordereau précédent"><ArrowRight className="size-4 rotate-180" /></button><button className="icon-action" disabled={activeShippingIndex >= shippingLabels.length - 1} onClick={() => setActiveShippingIndex((index) => index + 1)} aria-label="Bordereau suivant"><ArrowRight className="size-4" /></button><button className="icon-action" onClick={() => { const next = shippingLabels.filter((label) => label.id !== activeShippingLabel.id); setShippingLabels(next); setActiveShippingIndex(Math.max(0, Math.min(activeShippingIndex, next.length - 1))); }} aria-label="Retirer ce bordereau"><X className="size-4" /></button></div></div><div className="shipping-cropper"><Cropper image={activeShippingLabel.image} crop={activeShippingLabel.crop} zoom={activeShippingLabel.zoom} aspect={2 / 3} onCropChange={(crop) => updateShippingLabel(activeShippingLabel.id, { crop })} onZoomChange={(zoom) => updateShippingLabel(activeShippingLabel.id, { zoom })} onCropComplete={(_, pixels) => updateShippingLabel(activeShippingLabel.id, { cropArea: pixels })} /></div><label className="zoom-control"><span>Ajuster le cadrage</span><input type="range" min="1" max="4" step="0.05" value={activeShippingLabel.zoom} onChange={(event) => updateShippingLabel(activeShippingLabel.id, { zoom: Number(event.target.value) })} /></label><div className="shipping-actions"><span>{shippingLabels.length} page{shippingLabels.length > 1 ? "s" : ""} · 100 × 150 mm chacune</span><button className="primary-button" onClick={() => void exportShippingLabels()}><ArrowDownToLine className="size-4" /> Exporter {shippingLabels.length} bordereau{shippingLabels.length > 1 ? "x" : ""}</button></div></>}
              {shippingError && <div className="alert-error"><ShieldAlert className="size-4 shrink-0" />{shippingError}</div>}
              <p className="privacy-note"><ShieldCheck className="size-3.5" /> Chaque bordereau cadré devient une page distincte. Pour un PDF source, sa première page est utilisée.</p>
            </div>
          </section>
        )}

        {scannerOpen && <div className="modal-backdrop" role="presentation"><section className="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="panel-heading"><div><span className="step-label">RECHERCHE DANS LE STOCK</span><h2 id="scanner-title">Scanner un SKU</h2></div><button className="icon-action" onClick={() => setScannerOpen(false)} aria-label="Fermer le scanner"><X className="size-4" /></button></div><QrScanner onScan={handleQrScan} /></section></div>}

        <footer className="app-footer"><span>VINTED COO <span>·</span> PRIVATE INVENTORY DESK</span><span>Les recommandations IA sont indicatives. Authentifiez et vérifiez chaque article avant publication.</span></footer>
      </div>
    </main>
  );
}