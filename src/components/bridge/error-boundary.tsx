import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class BridgeErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Never log cookies, authorization headers, tokens, or user/session objects.
    console.error("[bridge-ui] Unhandled render failure", {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="grid min-h-screen place-items-center bg-bg p-6">
          <section className="w-full max-w-lg space-y-4 rounded-2xl border border-line bg-surface p-7" role="alert">
            <h1 className="font-display text-2xl text-fg">This workspace could not be displayed</h1>
            <p className="text-sm leading-relaxed text-muted">
              An unexpected application error interrupted this page. Reload to retry. If the problem continues,
              contact Bridge support with the time of the error.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white"
            >
              Reload workspace
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
