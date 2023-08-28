import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

//conditionally y-indexeddb, because it breaks unit tests, where indexedDB is
//neither available nor used
let yIDB = null;
if ("indexedDB" in window) {
  yIDB = import("y-indexeddb");
}

/**
 * a custom interface that mimics IndexeddbPersistence from YJS
 * it's neded as y-indexeddb is conditionaly imported
 */
interface IndexedDBProvider {
  close: () => void;
}

export class Binding {
  doc: Y.Doc;
  indexedDBProvider: IndexedDBProvider;
  wsProvider: WebsocketProvider;

  constructor(docID: string) {
    this.doc = new Y.Doc();

    /* FIXME
    //IndexedDBProvider
    if ("indexedDB" in window) {
      yIDB.then(({ IndexeddbPersistence }) => {
        this.indexedDBProvider = new IndexeddbPersistence(docID, this.doc);
      });
    } else if (!("__vitest_environment__" in globalThis)) {
      console.warn(
        "IndexedDB is not supported in this browser. Disabling offline mode."
      );
    }
    */

    //WebsocketProvider
    const wsURL = "ws://" + window.location.hostname + ":8080";
    const roomName = "notes/0/" + docID;
    //console.log(`WebSocket URL: ${wsURL}/${roomName}`)
    this.wsProvider = new WebsocketProvider(wsURL, roomName, this.doc, {
      connect: true,
    });
    this.wsProvider.shouldConnect = true; //reconnect after disconnecting

    //this.wsProvider.on("update", (isLoaded) => {
    //  console.log("ws update", this.doc.isLoaded, this.doc.isSynced, isLoaded);
    //});
    ////this.doc.on("update", (isLoaded) => {
    ////  console.log("doc update", this.doc.isLoaded, this.doc.isSynced, isLoaded);
    ////});
    //this.wsProvider.on("sync", (isLoaded) => {
    //  console.log("ws synced", this.doc.isLoaded, this.doc.isSynced, isLoaded);
    //  //this.doc.load();
    //});
    //this.doc.on("sync", (isLoaded) => {
    //  console.log("doc synced", this.doc.isLoaded, this.doc.isSynced, isLoaded);
    //});
    //this.doc.on("load", (isLoaded) => {
    //  console.log("doc loaded", this.doc.isLoaded, this.doc.isSynced, isLoaded);
    //});
  }

  close() {
    this.indexedDBProvider && this.indexedDBProvider.close();
  }
}
