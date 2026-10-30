import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 font-mono">
          <div className="w-full max-w-[420px] bg-gray-900 border border-red-900 rounded-xl p-6">
            <h1 className="text-xl font-bold text-red-400 mb-4">⚠️ App Error</h1>
            <p className="text-sm text-gray-300 mb-4">
              Something went wrong. Please try refreshing the page.
            </p>
            <div className="bg-black rounded p-3 mb-4 max-h-40 overflow-y-auto">
              <p className="text-xs text-red-400 font-mono break-all">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-900/50 border border-red-800 rounded-lg text-red-400 font-bold tracking-wider text-sm hover:bg-red-900/70 active:scale-95 transition-all"
            >
              🔄 RELOAD APP
            </button>
            <p className="text-[9px] text-gray-600 mt-3 text-center">
              If this keeps happening, try using Chrome browser
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
