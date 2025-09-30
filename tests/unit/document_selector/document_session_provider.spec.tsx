import { act, renderHook } from "@testing-library/react";
import {
  DocumentSelectorProvider,
  useDocumentSelector,
} from "@/features/editor/DocumentSelector/DocumentSessionProvider";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const navigateMock = vi.fn();
const setSearchParamsMock = vi.fn();
let currentSearchParams = new URLSearchParams();
let setSearchParamsCalls: Array<{ params: URLSearchParams; options: { replace?: boolean } | undefined }> = [];

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => navigateMock),
    useSearchParams: vi.fn(() => [currentSearchParams, setSearchParamsMock] as const),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return <DocumentSelectorProvider>{children}</DocumentSelectorProvider>;
}

describe("document session provider navigation", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams("documentID=main");
    setSearchParamsCalls = [];
    navigateMock.mockReset();
    setSearchParamsMock.mockReset();
    setSearchParamsMock.mockImplementation((init: any, options?: { replace?: boolean }) => {
      const next = init instanceof URLSearchParams ? init : new URLSearchParams(init);
      currentSearchParams = new URLSearchParams(next);
      setSearchParamsCalls.push({ params: new URLSearchParams(currentSearchParams), options });
    });
  });

  it("selectDocument pushes a new history entry and updates the query", () => {
    const { result } = renderHook(() => useDocumentSelector(), { wrapper });

    act(() => {
      result.current.selectDocument("secondary");
    });

    expect(result.current.documentID).toBe("secondary");
    expect(currentSearchParams.get("documentID")).toBe("secondary");
    expect(setSearchParamsCalls.length).toBeGreaterThanOrEqual(1);
    expect(setSearchParamsCalls[setSearchParamsCalls.length - 1]?.options).toBeUndefined();
    expect(navigateMock).toHaveBeenCalledWith("/", undefined);
  });

  it("selectDocument with replace does not push history", () => {
    currentSearchParams = new URLSearchParams("documentID=initial");
    const { result } = renderHook(() => useDocumentSelector(), { wrapper });

    act(() => {
      result.current.selectDocument("replacement", { replace: true });
    });

    expect(result.current.documentID).toBe("replacement");
    expect(currentSearchParams.get("documentID")).toBe("replacement");
    expect(setSearchParamsCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of setSearchParamsCalls) {
      expect(call.options?.replace).toBe(true);
    }
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("setDocumentIdSilently does not touch navigation", () => {
    const { result } = renderHook(() => useDocumentSelector(), { wrapper });

    act(() => {
      result.current.setDocumentIdSilently("silent");
    });

    expect(result.current.documentID).toBe("silent");
    expect(currentSearchParams.get("documentID")).toBe("main");
    expect(setSearchParamsCalls).toHaveLength(0);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("is a no-op when selecting the current document", () => {
    const { result } = renderHook(() => useDocumentSelector(), { wrapper });

    act(() => {
      result.current.selectDocument("main");
    });

    expect(setSearchParamsCalls).toHaveLength(0);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
