/// <reference types="vite/client" />
import App from "./App";
import ReactDOM from "react-dom/client";

//clear console on hot reload
if (import.meta.hot) {
  import.meta.hot.on("vite:beforeUpdate", () => console.clear());
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(<App />);
