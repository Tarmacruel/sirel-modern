from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from ata_sessao_reports.sd_parser import SDItem, SDParsingError, parse_sd_pdf


def _decimal_to_number(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _item_to_dict(item: SDItem) -> dict[str, Any]:
    return {
        "numero": item.numero,
        "catmat_catser": item.catmat_catser,
        "descricao": item.descricao,
        "quantidade": _decimal_to_number(item.quantidade),
        "percentual": _decimal_to_number(item.percentual),
        "unidade": item.unidade,
        "preco_unitario": _decimal_to_number(item.preco_unitario),
        "preco_total": _decimal_to_number(item.preco_total),
        "raw_line": item.raw_line,
    }


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
    payload = {
        "source_path": str(input_path),
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_itens": len(parsed.itens),
            "warnings": len(parsed.warnings),
            "parsing_errors": len(parsed.parsing_errors),
        },
        "metadata": {
            "numero_sd": parsed.metadata.numero_sd,
            "data_emissao": parsed.metadata.data_emissao,
            "centro_custo": parsed.metadata.centro_custo,
            "unidade_orcamentaria": parsed.metadata.unidade_orcamentaria,
            "elemento_despesa": parsed.metadata.elemento_despesa,
            "fonte_recurso": parsed.metadata.fonte_recurso,
            "valor_total": _decimal_to_number(parsed.metadata.valor_total),
            "assunto_objeto": parsed.metadata.assunto_objeto,
            "processo_administrativo": parsed.metadata.processo_administrativo,
            "classificacoes_orcamentarias": [
                {
                    "codigo_reduzido": item.codigo_reduzido,
                    "unidade_orcamentaria": item.unidade_orcamentaria,
                    "projeto_atividade": item.projeto_atividade,
                    "elemento_despesa": item.elemento_despesa,
                    "fonte_recurso": item.fonte_recurso,
                }
                for item in parsed.metadata.classificacoes_orcamentarias
            ],
        },
        "warnings": parsed.warnings,
        "parsing_errors": parsed.parsing_errors,
        "itens": [_item_to_dict(item) for item in parsed.itens],
    }

    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
