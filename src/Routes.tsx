import { DebugProvider } from "./DebugContext";
import { Dev } from "./components/Dev/Dev";
import { Yjs } from "./components/Dev/Yjs";
import Editor from "@/components/Editor/Editor";
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
  return (
    <DebugProvider>
      <RouterRoutes>
        <Route path="/" element={<Layout />}>
          <Route element={<Editor />}>
            <Route path="" element="</>" index></Route>
            <Route path="note/:noteID" element="</>"></Route>
          </Route>
          <Route path="about" element={<div>About</div>} />
          <Route path="dev">
            <Route path="" element={<Dev />} index></Route>
            <Route path="yjs" element={<Yjs />} />
          </Route>
        </Route>
      </RouterRoutes>
    </DebugProvider>
  );
}
