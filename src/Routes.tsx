import { DebugProvider } from "./DebugContext";
import Editor from "@/features/editor/Editor";
import { renderDevRoutes } from "@/devtools/routes";
import { Routes as RouterRoutes, Route } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { TopNavBar } from "./components/TopNavBar";

function Layout() {
  return (
    <div className="container">
      <TopNavBar />
      <Outlet />
    </div>
  );
}

export function Routes() {
  const devRoutes = renderDevRoutes();

  return (
    <DebugProvider>
      <RouterRoutes>
        <Route path="/" element={<Layout />}>
          <Route element={<Editor />}>
            <Route path="" element="</>" index></Route>
            <Route path="note/:noteID" element="</>"></Route>
          </Route>
          <Route path="about" element={<div>About</div>} />
          {devRoutes}
        </Route>
      </RouterRoutes>
    </DebugProvider>
  );
}
