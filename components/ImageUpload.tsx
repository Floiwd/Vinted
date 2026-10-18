import React, { useState, useRef } from 'react';
import { Upload, Camera, Plus, Loader2, X, Euro } from 'lucide-react';

interface ImageUploadProps {
  onImagesSelected: (images: Array<{ base64: string, preview: string }>, purchasePrice?: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onImagesSelected, disabled, compact = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Array<{ base64: string, preview: string }>>([]);
  const [purchasePrice, setPurchasePrice] = useState<string>('');

  // Fonction utilitaire pour redimensionner et compresser l'image
  const processImage = async (file: File): Promise<{ base64: string, preview: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          // Calcul des nouvelles dimensions
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Compression JPEG à 80%
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const base64 = dataUrl.split(',')[1];
            resolve({ base64, preview: dataUrl });
          } else {
            // Fallback si canvas échoue
            resolve({
              base64: (event.target?.result as string).split(',')[1],
              preview: event.target?.result as string
            });
          }
        };
      };
    });
  };

  const processFiles = async (files: FileList | File[]) => {
    if (disabled || isProcessing) return;
    setIsProcessing(true);

    const promises: Promise<{ base64: string, preview: string }>[] = [];

    Array.from(files).forEach(file => {
      if (file && file.type.startsWith('image/')) {
        promises.push(processImage(file));
      }
    });

    try {
      const processedImages = await Promise.all(promises);
      if (processedImages.length > 0) {
        if (compact) {
          // In compact mode, immediately bubble up the images
          onImagesSelected(processedImages);
          // We don't need to store them in local state for compact mode usually, 
          // but we can if we want to keep consistency.
        } else {
          setSelectedImages(prev => [...prev, ...processedImages]);
        }
      }
    } catch (error) {
      console.error("Erreur traitement image:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    // Reset value
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const triggerFileInput = () => {
    if (!disabled && !isProcessing) {
      fileInputRef.current?.click();
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartAnalysis = () => {
    if (selectedImages.length > 0) {
      onImagesSelected(selectedImages, purchasePrice);
    }
  };

  if (compact) {
    // Compact mode implementation
    return (
      <div className="w-full h-full relative">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          multiple
          onChange={(e) => {
            console.log("Compact Input Changed", e.target.files);
            handleChange(e);
          }}
          disabled={disabled || isProcessing}
        />
        <button
          onClick={(e) => {
            e.preventDefault(); // Prevent form submission if inside form
            e.stopPropagation();
            console.log("Compact Button Clicked");
            triggerFileInput();
          }}
          type="button" // Explicitly type button to prevent form submit
          disabled={disabled || isProcessing}
          className="w-full h-full flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-vinted hover:text-vinted transition-colors p-4 relative"
        >
          {isProcessing ? (
            <Loader2 size={24} className="animate-spin text-vinted" />
          ) : (
            <>
              <Plus size={24} />
              <span className="text-xs font-medium mt-1">Ajouter</span>
            </>
          )}
        </button>
      </div>
    )
  }

  // Si des images sont sélectionnées, on affiche la vue "Preview & Config"
  if (selectedImages.length > 0) {
    return (
      <div className="space-y-6">
        {/* Image Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {selectedImages.map((img, idx) => (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group">
              <img src={img.preview} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={triggerFileInput}
            className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-vinted hover:text-vinted transition-colors bg-slate-50"
          >
            <Plus size={24} />
            <span className="text-xs font-bold mt-1">Ajouter</span>
          </button>
        </div>

        {/* Settings */}
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-1/2">
            <label className="block text-sm font-bold text-slate-700 mb-2">Prix d'achat (optionnel)</label>
            <div className="relative">
              <Euro size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-vinted focus:border-transparent outline-none font-bold text-slate-800"
              />
            </div>
          </div>

          <button
            onClick={handleStartAnalysis}
            disabled={isProcessing}
            className="w-full md:w-1/2 bg-vinted hover:bg-vinted-dark text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Camera size={20} />}
            <span>Générer l'annonce</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          multiple
          onChange={handleChange}
          disabled={disabled || isProcessing}
        />
      </div>
    );
  }

  // Vue initiale (Dropzone)
  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple
        onChange={handleChange}
        disabled={disabled || isProcessing}
      />

      <div
        className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl transition-all duration-300 cursor-pointer overflow-hidden
          ${dragActive ? 'border-vinted bg-vinted-light' : 'border-slate-300 bg-white hover:bg-slate-50'}
          ${(disabled || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center text-vinted">
            <Loader2 size={48} className="animate-spin mb-3" />
            <p className="font-semibold text-sm">Optimisation des photos...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-5 pb-6 space-y-3">
            <div className="p-4 bg-vinted-light rounded-full text-vinted">
              <Upload size={32} />
            </div>
            <div className="text-center px-4">
              <p className="mb-1 text-sm text-slate-700 font-semibold">
                <span className="text-vinted font-bold">Cliquez pour uploader</span> ou glissez vos photos
              </p>
              <p className="text-xs text-slate-500">
                Plusieurs photos = meilleure analyse
              </p>
            </div>
          </div>
        )}

        <div className="absolute bottom-2 right-2 md:hidden text-slate-400">
          <Camera size={20} />
        </div>
      </div>
    </div>
  );
};