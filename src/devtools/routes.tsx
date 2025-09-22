import { Suspense, lazy } from "react";
import { Route } from "react-router-dom";

const DevTools = lazy(async () => ({
  default: (await import("./index")).DevTools,
}));

const DevDemo = lazy(async () => ({
  default: (await import("./demo/Demo")).Demo,
}));

const DevYjs = lazy(async () => ({
  default: (await import("./yjs/Yjs")).Yjs,
}));

export function renderDevRoutes() {
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <Route
      path="_dev"
      element={
        <Suspense fallback={null}>
          <DevTools />
        </Suspense>
      }
    >
      <Route
        path="demo"
        element={
          <Suspense fallback={null}>
            <DevDemo />
          </Suspense>
        }
      />
      <Route
        path="yjs"
        element={
          <Suspense fallback={null}>
            <DevYjs />
          </Suspense>
        }
      />
    </Route>
  );
}
