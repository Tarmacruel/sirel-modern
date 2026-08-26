from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ata_sessao_reports.sd_parser import SDParsingError, parse_sd_pdf, sd_record_to_dict


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Processa uma Solicitação de Despesa (SD) em PDF")
    parser.add_argument("--input", required=True, help="Caminho do arquivo PDF")
    parser.add_argument("--json-out", required=True, help="Arquivo de saída JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.json_out).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        parsed = parse_sd_pdf(input_path)
    except SDParsingError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    payload = sd_record_to_dict(parsed)

    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
