from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from .excel import write_reports_workbooks
from .models import ensure_directory
from .parser import normalize_ascii_slug, parse_ata_sessao_pdf


def build_logger(output_dir: Path) -> logging.Logger:
    logger = logging.getLogger(f"ata_sessao_reports.{output_dir.name}")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    file_handler = logging.FileHandler(output_dir / 'warnings.log', encoding='utf-8')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    return logger


def main() -> int:
    parser = argparse.ArgumentParser(description='Processa atas de sessão e gera relatórios estruturados.')
    parser.add_argument('--input', required=True, help='Caminho do PDF de ata de sessão.')
    parser.add_argument('--output-dir', required=True, help='Diretório de saída para os artefatos.')
    parser.add_argument('--json-out', help='Caminho opcional do JSON consolidado.')
    args = parser.parse_args()

    pdf_path = Path(args.input).expanduser().resolve()
    output_dir = ensure_directory(Path(args.output_dir).expanduser().resolve())
    logger = build_logger(output_dir)
    parsing_errors_path = output_dir / 'erros_parsing.log'

    result = parse_ata_sessao_pdf(pdf_path, logger=logger, parsing_error_log_path=parsing_errors_path)
    artifacts = write_reports_workbooks(result, output_dir)

    payload = result.to_dict()
    payload['artifacts'] = artifacts

    json_out = Path(args.json_out).expanduser().resolve() if args.json_out else output_dir / f"{normalize_ascii_slug(pdf_path.stem)}-relatorio.json"
    json_out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')

    print(json.dumps({
        'output_dir': str(output_dir),
        'json_path': str(json_out),
        'summary': payload['summary'],
        'artifacts': artifacts,
    }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
