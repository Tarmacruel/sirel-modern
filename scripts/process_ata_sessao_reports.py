from __future__ import annotations

import sys
from pathlib import Path

THIS_FILE = Path(__file__).resolve()
REPO_ROOT = THIS_FILE.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.ata_sessao_reports.cli import main

if __name__ == '__main__':
    raise SystemExit(main())
