import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

// Utility function to log messages to the debug console
function log(source, event): void {
  const message = JSON.stringify(event, null, 2);
  const consoleDiv = document.getElementById("console");
  if (consoleDiv) {
    consoleDiv.textContent += `${source}: ${message}\n`;
  }
  //console.log(message);
}

// Create a Yjs document
const ydoc = new Y.Doc();

// Define the websocket server URL
const websocketServerUrl = "ws://athena:8080";

// Initialize the websocket provider
const provider = new WebsocketProvider(
  websocketServerUrl,
  "notes/0/basic",
  ydoc
);

// Get or create a Y.Map instance from the Yjs document
const ymap = ydoc.get("root", Y.XmlText);

// Listen to all events in the Yjs document
ydoc.on("all", e => log("all", e));

ydoc.on("sync", e => log("sync", e));
ydoc.on("status", e => log("status", e));
//ydoc.on("update", e => log("update", e));
ydoc.on("reload", e => log("reload", e));

// Listen to events on the Y.Map instance
ymap.observeDeep((event, transaction) => {
  log("observeDeep", event);
});

// Listen to events on the websocket provider
provider.on("status", event => {
  log("status", event);
});

// Example: add data to the Y.Map instance
//ymap.set('key', 'value');
