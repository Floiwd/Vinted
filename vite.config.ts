import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Charge les variables d'environnement (depuis .env ou le système)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Mappe la variable API_KEY (Vercel) vers VITE_API_KEY (Utilisé dans l'app)
      'import.meta.env.VITE_API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY)
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor': ['react', 'react-dom'],
            'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            'ui': ['lucide-react', 'clsx', 'tailwind-merge']
          }
        }
      }
    }
  };
});