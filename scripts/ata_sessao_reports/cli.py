from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from .data_normalizer import normalize_report_data
from .enrichment import apply_estimated_value_enrichment
from .excel import write_reports_workbooks
from .models import ensure_directory
from .parser import normalize_ascii_slug, parse_ata_sessao_pdf
from .pdf_renderer import write_ata_institucional_pdf, write_report_pdfs


def build_logger(output_dir: Path) -> logging.Logger:
    logger = logging.getLogger(f"ata_sessao_reports.{output_dir.name}")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    file_handler = logging.FileHandler(output_dir / "warnings.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    return logger


def build_render_logger(output_dir: Path) -> logging.Logger:
    logger = logging.getLogger(f"ata_sessao_reports.render.{output_dir.name}")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    file_handler = logging.FileHandler(output_dir / "erros_renderizacao.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger


def _load_branding(path: str | None) -> dict[str, object] | None:
    if not path:
        return None
    branding_path = Path(path).expanduser().resolve()
    if not branding_path.exists():
        return None
    return json.loads(branding_path.read_text(encoding="utf-8"))


def _load_enrichment(path: str | None) -> dict[str, object] | None:
    if not path:
        return None
    enrichment_path = Path(path).expanduser().resolve()
    if not enrichment_path.exists():
        return None
    return json.loads(enrichment_path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Processa atas de sessão e gera relatórios estruturados.")
    parser.add_argument("--input", required=True, help="Caminho do PDF de ata de sessão.")
    parser.add_argument("--output-dir", required=True, help="Diretório de saída para os artefatos.")
    parser.add_argument("--json-out", help="Caminho opcional do JSON consolidado.")
    parser.add_argument("--generated-by", help="Nome do usuário que gerou o relatório.")
    parser.add_argument("--branding-json", help="JSON opcional com linhas institucionais, rodapé e logo.")
    parser.add_argument("--edital", help="Informação textual do edital/pregão exibida no cabeçalho.")
    parser.add_argument("--processo-administrativo", help="Processo administrativo exibido no cabeçalho.")
    parser.add_argument("--arquivo-origem", help="Nome amigável do arquivo de origem exibido no cabeçalho.")
    parser.add_argument("--data-geracao", help="Data de geração textual exibida no cabeçalho.")
    parser.add_argument("--enrichment-json", help="JSON opcional com valores estimados internos para enriquecer os lotes.")
    args = parser.parse_args()

    pdf_path = Path(args.input).expanduser().resolve()
    output_dir = ensure_directory(Path(args.output_dir).expanduser().resolve())
    logger = build_logger(output_dir)
    render_logger = build_render_logger(output_dir)
    parsing_errors_path = output_dir / "erros_parsing.log"

    result = parse_ata_sessao_pdf(pdf_path, logger=logger, parsing_error_log_path=parsing_errors_path)
    enrichment_metadata = apply_estimated_value_enrichment(
        result,
        _load_enrichment(args.enrichment_json),
        logger=render_logger,
    )
    normalized = normalize_report_data(
        result,
        metadata={
            "edital": args.edital,
            "processo_administrativo": args.processo_administrativo,
            "arquivo_origem": args.arquivo_origem,
            "data_geracao": args.data_geracao,
        },
        logger=render_logger,
    )
    branding = _load_branding(args.branding_json)
    artifacts = write_ata_institucional_pdf(
        result,
        normalized,
        output_dir,
        branding=branding,
        generated_by=args.generated_by,
        logger=render_logger,
    )
    artifacts.update(write_reports_workbooks(result, output_dir))
    artifacts.update(
        write_report_pdfs(
            normalized,
            output_dir,
            branding=branding,
            generated_by=args.generated_by,
            logger=render_logger,
        )
    )

    payload = result.to_dict()
    payload["report_metadata"] = {
        "arquivo_origem": normalized.header.arquivo_origem,
        "data_geracao": normalized.header.data_geracao,
        "edital": normalized.header.edital,
        "processo_administrativo": normalized.header.processo_administrativo,
    }
    if enrichment_metadata is not None:
        payload["enrichment"] = enrichment_metadata
    payload["artifacts"] = artifacts

    json_out = Path(args.json_out).expanduser().resolve() if args.json_out else output_dir / f"{normalize_ascii_slug(pdf_path.stem)}-relatorio.json"
    json_out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "output_dir": str(output_dir),
        "json_path": str(json_out),
        "summary": payload["summary"],
        "artifacts": artifacts,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
