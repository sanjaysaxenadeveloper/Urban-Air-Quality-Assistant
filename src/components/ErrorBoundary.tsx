import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error.name, info.componentStack ? 'component error' : '');
  }

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div
          role="alert"
          className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 dark:border-rose-900 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            <h1 className="font-display text-lg font-bold">Something went wrong</h1>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            The interface encountered an unexpected error. Your guest preferences remain safely cached on this device.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
