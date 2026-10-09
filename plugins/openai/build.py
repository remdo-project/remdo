"""Build the RemDo OpenAI plugin ZIP from this directory's sources."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

PLUGIN = Path(__file__).resolve().parent


def main():
    manifest = json.loads((PLUGIN / "plugin.json").read_text(encoding="utf-8"))
    files = {
        "plugin.json": (PLUGIN / "plugin.json").read_bytes(),
        "mcp.json": (PLUGIN / "mcp.json").read_bytes(),
        "assets/icon.png": (PLUGIN / "assets" / "icon.png").read_bytes(),
        "LICENSE": (PLUGIN / "LICENSE").read_bytes(),
    }
    output = PLUGIN / "dist" / f"{manifest['name']}-openai-{manifest['version']}.zip"
    output.parent.mkdir(parents=True, exist_ok=True)

    with ZipFile(output, "w") as archive:
        for name, content in files.items():
            # Fixed timestamps and permissions make rebuilds independent of the checkout.
            entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, content, compress_type=ZIP_DEFLATED)

    print(f"Built {output} ({len(files)} files)")


if __name__ == "__main__":
    main()
