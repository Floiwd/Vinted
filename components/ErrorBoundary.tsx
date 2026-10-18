import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full border border-red-100">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="p-4 bg-red-50 rounded-full text-red-500">
                                <AlertTriangle size={48} />
                            </div>
                            <h1 className="text-2xl font-black text-slate-800">Oups ! Une erreur est survenue.</h1>
                            <p className="text-slate-500 font-medium">
                                L'application a rencontré un problème inattendu.
                            </p>

                            <div className="w-full bg-slate-100 p-4 rounded-xl overflow-auto text-left max-h-48 my-4 border border-slate-200">
                                <p className="font-mono text-xs text-red-600 break-words mb-2 font-bold">
                                    {this.state.error?.toString()}
                                </p>
                                <pre className="font-mono text-[10px] text-slate-500 whitespace-pre-wrap">
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </div>

                            <button
                                onClick={() => window.location.reload()}
                                className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors"
                            >
                                <RefreshCw size={18} />
                                Recharger l'application
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
