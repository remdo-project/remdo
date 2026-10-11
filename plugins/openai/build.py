"""Build the RemDo OpenAI plugin ZIP from this directory's sources."""

import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZipInfo

PLUGIN = Path(__file__).resolve().parent


def main():
    manifest = json.loads((PLUGIN / "plugin.json").read_text(encoding="utf-8"))
    files = {
        "plugin.json": (PLUGIN / "plugin.json").read_bytes(),
        "mcp.json": (PLUGIN / "mcp.json").read_bytes(),
        "LICENSE": (PLUGIN / "LICENSE").read_bytes(),
    }
    interface = manifest["extensions"]["com.openai"]["interface"]
    assets = [interface["composerIcon"], interface["logo"]]
    assets += [interface[field] for field in ("composerIconDark", "logoDark") if field in interface]
    assets += interface.get("screenshots", [])
    for asset in assets:
        path = PurePosixPath(asset)
        if not asset.startswith("./assets/") or ".." in path.parts or "\\" in asset:
            raise ValueError("Branding assets must use ./assets/ paths without traversal.")
        files[path.as_posix()] = (PLUGIN / path).read_bytes()

    output = (
        PLUGIN.parents[1]
        / "data/plugins/openai"
        / f"{manifest['name']}-openai-{manifest['version']}.zip"
    )
    output.parent.mkdir(parents=True, exist_ok=True)

    with ZipFile(output, "w") as archive:
        for name, content in files.items():
            # Fixed timestamps and permissions make rebuilds independent of the checkout.
            entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, content)

    print(f"Built {output} ({len(files)} files)")


if __name__ == "__main__":
    main()
