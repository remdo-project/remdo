import { useState, createContext, useContext, useEffect, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface DebugContextType {
  isDebugMode: boolean;
  toggleDebugMode: () => void;
}

const DebugContext = createContext<DebugContextType>({
  isDebugMode: false,
  toggleDebugMode: () => { },
});

export const useDebug = (): DebugContextType => {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error("useDebug must be used within a DebugProvider");
  }
  return context;
};

export const DebugProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDebugMode, setDebugMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setDebugMode(params.get("debug") === "true");
    // execute only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDebugMode = () => {
    //toggle state
    setDebugMode(!isDebugMode);

    //change the url
    const params = new URLSearchParams(location.search);
    if (isDebugMode) {
      params.delete("debug");
    } else {
      params.set("debug", "true");
    }
    navigate(`?${params.toString()}`, { replace: true });
  };

  return (
    <DebugContext.Provider value={{ isDebugMode, toggleDebugMode }}>
      {children}
    </DebugContext.Provider>
  );
};
