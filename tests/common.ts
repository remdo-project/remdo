import path from "path";

export function getDataPath(nameOrPath: string) {
  nameOrPath = nameOrPath.trim();
  nameOrPath += nameOrPath.endsWith(".json") ? "" : ".json";
  const baseName = path.basename(nameOrPath);

  return nameOrPath !== baseName
    ? nameOrPath
    : path.join(__dirname, "data", baseName);
}

//TODO remove and use Notebook.getNotes instead
export function htmlToCommaSeparatedText(html: string) {
  return html
    .replace(/<[^>]*>?/gm, "")
    .trim()
    .replace(/\s+/g, ",");
}

export const collabEnabled = process.env.VITE_WS === "true";
export const debugEnabled = process.env.VITE_DEBUG === "true";
