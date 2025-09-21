import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface DebugContextType {
  isDebugMode: boolean;
  toggleDebugMode: () => void;
}

const DebugContext = createContext<DebugContextType | null>(null);

// TODO: Move this hook into a standalone module to make Fast Refresh happier.
// eslint-disable-next-line react-refresh/only-export-components
export const useDebug = (): DebugContextType => {
  const context = use(DebugContext);
  if (!context) {
    throw new Error("useDebug must be used within a DebugProvider");
  }
  return context;
};

export const DebugProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isDebugParamEnabled = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("debug") === "true";
  }, [location.search]);
  const [isDebugMode, setDebugMode] = useState(isDebugParamEnabled);

  useEffect(() => {
    // TODO: Replace this state bridge with a router subscription (e.g.,
    // useSyncExternalStore) so we can avoid calling setState inside an effect.
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setDebugMode((previous) =>
      previous === isDebugParamEnabled ? previous : isDebugParamEnabled
    );
  }, [isDebugParamEnabled]);

  const toggleDebugMode = useCallback(() => {
    setDebugMode((previous) => {
      const nextValue = !previous;
      const params = new URLSearchParams(location.search);
      if (nextValue) {
        params.set("debug", "true");
      } else {
        params.delete("debug");
      }
      const search = params.toString();
      navigate(search ? `?${search}` : "?", { replace: true });
      return nextValue;
    });
  }, [location.search, navigate]);

  const contextValue = useMemo(
    () => ({
      isDebugMode,
      toggleDebugMode,
    }),
    [isDebugMode, toggleDebugMode]
  );

  // TODO: Split the context definition from the provider/exported hook to appease
  // `react-refresh/only-export-components`. That refactor touches multiple import
  // sites, so defer until we can stage the module moves alongside updated
  // Storybook/dev tooling expectations.

  return <DebugContext value={contextValue}>{children}</DebugContext>;
};
