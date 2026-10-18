import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebaseConfig';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { StorageService } from '../services/firebase';
import { UserPreferences, DEFAULT_PREFERENCES } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userPreferences: UserPreferences;
  loading: boolean;
  logout: () => Promise<void>;
  updatePreferences: (newPrefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Load preferences
        const prefs = await StorageService.getPreferences(user.uid);
        setUserPreferences(prefs);
      } else {
        setUserPreferences(DEFAULT_PREFERENCES);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = async () => {
    await firebaseSignOut(auth);
    setUserPreferences(DEFAULT_PREFERENCES);
  };

  const updatePreferences = async (newPrefs: Partial<UserPreferences>) => {
    if (!currentUser) return;
    const updated = { ...userPreferences, ...newPrefs };
    setUserPreferences(updated);
    await StorageService.savePreferences(currentUser.uid, updated);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-vinted/20 rounded-full flex items-center justify-center">
            {/* We need to ensure we can use icons here, but we are inside a provider file. 
                 It's safer to use simple HTML/CSS or import icons. 
                 Let's stick to simple HTML if imports are tricky, OR better, let's just use text for now to be safe, 
                 or import icons. Lucide is used everywhere. 
             */}
            <svg className="animate-spin h-8 w-8 text-vinted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-slate-400 font-medium text-sm">Chargement Vinted Assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ currentUser, userPreferences, loading, logout, updatePreferences }}>
      {children}
    </AuthContext.Provider>
  );
};