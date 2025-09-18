import path from "path";

export function getDataPath(nameOrPath: string) {
  nameOrPath = nameOrPath.trim();
  nameOrPath += nameOrPath.endsWith(".json") ? "" : ".json";
  const baseName = path.basename(nameOrPath);

  return nameOrPath !== baseName
    ? nameOrPath
    : path.join(__dirname, "data", baseName);
}
