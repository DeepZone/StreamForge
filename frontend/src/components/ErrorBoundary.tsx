import { Component, ErrorInfo, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Render error caught by ErrorBoundary', error, errorInfo);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const details = import.meta.env.DEV && this.state.error ? this.state.error.message : null;

      return (
        <div className='mx-auto max-w-2xl p-6 space-y-4'>
          <h1 className='text-xl font-semibold'>Die Seite konnte nicht gerendert werden.</h1>
          <button
            type='button'
            onClick={this.reload}
            className='rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700'
          >
            Neu laden
          </button>
          {details && <pre className='rounded border border-zinc-700 bg-zinc-950 p-3 text-xs'>{details}</pre>}
        </div>
      );
    }

    return this.props.children;
  }
}
