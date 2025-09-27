import "./TopNavBar.scss";
import { Nav } from "react-bootstrap";
import { useDebug } from "@/DebugContext";
import { NavLink } from "react-router-dom";

export function TopNavBar() {
  const { isDebugMode, toggleDebugMode } = useDebug();

  return (
    <nav className="navbar navbar-expand-lg">
      <a className="navbar-brand" href="/">
        <span className="logo" aria-hidden="true" />
        RemDo
      </a>
      <NavLink className="nav-link" to="/_dev">
        Dev
      </NavLink>
      <NavLink className="nav-link" to="/about">
        About
      </NavLink>
      <Nav.Link
        className="nav-link ms-auto"
        onClick={toggleDebugMode}
        id="debug-toggle"
      >
        Debug: {isDebugMode ? "On" : "Off"}
      </Nav.Link>
    </nav>
  );
}
