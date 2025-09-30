import { act, renderHook } from "@testing-library/react";
import {
  DocumentSelectorProvider,
  useDocumentSelector,
} from "@/features/editor/DocumentSelector/DocumentSessionProvider";
import { useCollabFactory } from "@/features/editor/DocumentSelector/useCollabFactory";
import type {
  CollaborationProviderFactory,
  CreateCollaborationProviderFactoryOptions,
} from "@/features/editor/collab/createCollaborationProviderFactory";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const navigateMock = vi.fn();
let currentSearchParams = new URLSearchParams();

let actualCreateCollaborationProviderFactory:
  | ((options?: CreateCollaborationProviderFactoryOptions) => CollaborationProviderFactory)
  | null = null;
const createCollaborationProviderFactoryMock = vi.fn<
  (options?: CreateCollaborationProviderFactoryOptions) => CollaborationProviderFactory
>();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => navigateMock),
    useSearchParams: vi.fn(() => [currentSearchParams, vi.fn()] as const),
  };
});

vi.mock("@/features/editor/collab/createCollaborationProviderFactory", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/editor/collab/createCollaborationProviderFactory")
  >("@/features/editor/collab/createCollaborationProviderFactory");
  return {
    ...actual,
    createCollaborationProviderFactory: (
      ...args: Parameters<typeof actual.createCollaborationProviderFactory>
    ) => createCollaborationProviderFactoryMock(...args),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return <DocumentSelectorProvider>{children}</DocumentSelectorProvider>;
}

describe("document session provider navigation", () => {
  beforeEach(async () => {
    currentSearchParams = new URLSearchParams("documentID=main");
    navigateMock.mockReset();
    createCollaborationProviderFactoryMock.mockReset();
    if (!actualCreateCollaborationProviderFactory) {
      const actual = await vi.importActual<
        typeof import("@/features/editor/collab/createCollaborationProviderFactory")
      >("@/features/editor/collab/createCollaborationProviderFactory");
      actualCreateCollaborationProviderFactory = actual.createCollaborationProviderFactory;
    }
    createCollaborationProviderFactoryMock.mockImplementation((options) => {
      if (!actualCreateCollaborationProviderFactory) {
        throw new Error("Expected actual createCollaborationProviderFactory to be available");
      }
      return actualCreateCollaborationProviderFactory(options);
    });
  });

  it("setId pushes a new history entry and updates the query by default", () => {
    const { result } = renderHook(() => useDocumentSelector(), { wrapper });

    act(() => {
      result.current.setId("secondary");
    });

    expect(result.current.id).toBe("secondary");
    expect(currentSearchParams.get("documentID")).toBe("main");
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(
      { pathname: "/", search: "?documentID=secondary" },
      { replace: false },
    );
  });

  it("setId with replace does not push history", () => {
    currentSearchParams = new URLSearchParams("documentID=initial");
    const { result } = renderHook(() => useDocumentSelector(), { wrapper });

    act(() => {
      result.current.setId("replacement", "replace");
    });

    expect(result.current.id).toBe("replacement");
    expect(currentSearchParams.get("documentID")).toBe("initial");
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(
      { pathname: "/", search: "?documentID=replacement" },
      { replace: true },
    );
  });

  it("setId silently swaps the document without touching navigation", () => {
    const { result } = renderHook(() => useDocumentSelector(), { wrapper });

    act(() => {
      result.current.setId("silent", "silent");
    });

    expect(result.current.id).toBe("silent");
    expect(currentSearchParams.get("documentID")).toBe("main");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("is a no-op when selecting the current document", () => {
    const { result } = renderHook(() => useDocumentSelector(), { wrapper });

    act(() => {
      result.current.setId("main");
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does not create a provider when collaboration is disabled", () => {
    const providerFactorySpy = vi.fn(() => {
      throw new Error("Provider factory should not be called when disabled");
    });
    createCollaborationProviderFactoryMock.mockImplementation(() => providerFactorySpy);
    currentSearchParams = new URLSearchParams("documentID=main&collab=false");

    const { result: sessionResult } = renderHook(() => useDocumentSelector(), { wrapper });
    const { result: factoryResult } = renderHook(() => useCollabFactory(), { wrapper });

    expect(sessionResult.current.collabDisabled).toBe(true);
    expect(() => factoryResult.current("main", new Map())).toThrowError(
      /Collaboration is disabled/i,
    );
    expect(providerFactorySpy).not.toHaveBeenCalled();
  });
});
