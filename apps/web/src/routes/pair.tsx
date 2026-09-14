import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import {
  HostedPairingRouteSurface,
  PairingPendingSurface,
  PairingRouteSurface,
} from "../components/auth/PairingRouteSurface";

export const Route = createFileRoute("/pair")({
  validateSearch: (search: Record<string, unknown>): PairSearch => {
    const returnTo = normalizeOAuthReturnPath(search.returnTo);
    return returnTo ? { returnTo } : {};
  },
  beforeLoad: async ({ context, search }) => {
    const { authGateState } = context;
    if (authGateState.status === "hosted-pairing") {
      return {
        authGateState,
      };
    }

    if (authGateState.status === "authenticated" || authGateState.status === "hosted-static") {
      throw redirect({ href: search.returnTo ?? "/", replace: true });
    }
    return {
      authGateState,
    };
  },
  component: PairRouteView,
  pendingComponent: PairRoutePendingView,
});

export interface PairSearch {
  readonly returnTo?: string;
}

function PairRouteView() {
  const { authGateState } = Route.useRouteContext();
  const { returnTo } = Route.useSearch();
  const navigate = useNavigate();

  if (!authGateState) {
    return null;
  }

  if (authGateState.status === "hosted-pairing") {
    return <HostedPairingRouteSurface />;
  }

  return (
    <PairingRouteSurface
      auth={authGateState.auth}
      onAuthenticated={() => {
        if (returnTo) {
          window.location.replace(returnTo);
          return;
        }
        void navigate({ to: "/", replace: true });
      }}
      {...(authGateState.errorMessage ? { initialErrorMessage: authGateState.errorMessage } : {})}
    />
  );
}

export function normalizeOAuthReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/oauth/authorize?")) return undefined;
  try {
    const url = new URL(value, "http://pulse.local");
    return url.origin === "http://pulse.local" && url.pathname === "/oauth/authorize"
      ? `${url.pathname}${url.search}`
      : undefined;
  } catch {
    return undefined;
  }
}

function PairRoutePendingView() {
  return <PairingPendingSurface />;
}
