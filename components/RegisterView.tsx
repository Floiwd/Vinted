import React, { useState } from 'react';
import { auth } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Mail, Lock, Loader2, User } from 'lucide-react';

interface RegisterViewProps {
    onNavigateToLogin: () => void;
}

export const RegisterView: React.FC<RegisterViewProps> = ({ onNavigateToLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            // Auto login happens, AuthContext will catch it
        } catch (err: any) {
            setError("Erreur lors de l'inscription. L'email est peut-être déjà utilisé.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 animate-fade-in-up">
                <div className="text-center">
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">
                        Créer un compte
                    </h2>
                    <p className="mt-2 text-slate-500">
                        Rejoignez l'élite des vendeurs Vinted
                    </p>
                </div>

                <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl shadow-indigo-200/20 border border-white/50">
                    <form onSubmit={handleRegister} className="space-y-5">
                        {error && (
                            <div className="bg-red-50 text-red-500 text-sm p-3 rounded-xl font-medium text-center animate-fade-in">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Email</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-vinted focus:border-transparent outline-none transition-all"
                                    placeholder="votre@email.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Mot de passe</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-vinted focus:border-transparent outline-none transition-all"
                                    placeholder="Minimum 6 caractères"
                                    minLength={6}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Confirmer</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="pl-10 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-vinted focus:border-transparent outline-none transition-all"
                                    placeholder="Répétez le mot de passe"
                                    minLength={6}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-vinted hover:bg-vinted-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vinted disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : "S'inscrire"}
                        </button>
                    </form>
                </div>

                <div className="text-center">
                    <button
                        onClick={onNavigateToLogin}
                        className="text-slate-600 hover:text-vinted font-bold text-sm transition-colors"
                    >
                        Déjà un compte ? <span className="text-vinted underline">Se connecter</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
