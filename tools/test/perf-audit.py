import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time

suite, workers, shard = sys.argv[1:]
candidates = json.loads(Path("tools/test/harness-candidates.json").read_text())
config_path = Path("vitest.config.mts")
config_text = config_path.read_text()
for group, files in candidates.items():
    marker = f"const {group}Tests = ["
    config_text = config_text.replace(marker, marker + "\n" + "".join(f"  '{file}',\n" for file in files))
config_path.write_text(config_text)
output = Path(".agent/perf-results")
output.mkdir(parents=True, exist_ok=True)
results = []
command = ["pnpm", "run", f"test:{suite}", f"--workers={workers}" if suite == "e2e" else f"--maxWorkers={workers}"]
if shard != "all":
    command.append(f"--shard={shard}")
for trial in (1, 2):
    start = time.monotonic()
    with (output / f"trial-{trial}.log").open("w") as log:
        process = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, env={**os.environ, "TEST_TIMEOUT": "900"})
    result = dict(suite=suite, workers=int(workers), shard=shard, trial=trial,
                  elapsed=time.monotonic()-start, exit_code=process.returncode,
                  cpus=os.cpu_count(), machine=platform.machine())
    results.append(result)
    print(json.dumps(result), flush=True)
    (output / "results.json").write_text(json.dumps(results, indent=2))
sys.exit(int(any(result["exit_code"] for result in results)))
