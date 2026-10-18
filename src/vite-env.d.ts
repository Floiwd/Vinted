/// <reference types="vite/client" />

// Déclare la structure de l'objet d'environnement pour que TypeScript
// reconnaisse 'import.meta.env' et 'VITE_API_KEY'
interface ImportMetaEnv {
  // Ajoutez toutes vos variables d'environnement VITE_... ici
  readonly VITE_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}