from __future__ import annotations

import io
import json
import logging
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from scripts.ata_sessao_reports.cli import main
from scripts.ata_sessao_reports.models import AtaSessaoParseResult, LotItemData, LotRecord
from scripts.ata_sessao_reports.sd_parser import (
    SDItem,
    SDMetadata,
    SDRecord,
    SDStructureError,
)


def _test_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    logger.propagate = False
    return logger


def _ata_result() -> AtaSessaoParseResult:
    return AtaSessaoParseResult(
        source_path="ata.pdf",
        generated_at="2026-08-12T10:00:00",
        lotes=[
            LotRecord(
                numero_lote=1,
                status="FRACASSADO",
                titulo="Cadeira escolar",
                itens=[
                    LotItemData(
                        item_numero="1",
                        descricao="CADEIRA ESCOLAR",
                        unidade="UND",
                        quantidade=2,
                    )
                ],
                motivo_falha="Sem proposta válida.",
            )
        ],
    )


def _sd_record() -> SDRecord:
    return SDRecord(
        source_path="sd.pdf",
        metadata=SDMetadata(
            numero_sd="152/2026",
            data_emissao=None,
            centro_custo=None,
            unidade_orcamentaria=None,
            elemento_despesa=None,
            fonte_recurso=None,
            valor_total=Decimal("200.00"),
            assunto_objeto=None,
            processo_administrativo="152/2026",
        ),
        itens=[
            SDItem(
                numero=1,
                catmat_catser=None,
                descricao="CADEIRA ESCOLAR",
                quantidade=Decimal("2"),
                percentual=Decimal("100"),
                unidade="UND",
                preco_unitario=Decimal("100.00"),
                preco_total=Decimal("200.00"),
            )
        ],
    )


class AtaSdCliTests(unittest.TestCase):
    def test_sd_input_generates_reconciliation_and_parsed_sd_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_dir = Path(tmp_dir) / "reports"
            json_path = output_dir / "consolidado.json"
            argv = [
                "process_ata_sessao_reports.py",
                "--input",
                str(Path(tmp_dir) / "ata.pdf"),
                "--sd-input",
                str(Path(tmp_dir) / "sd.pdf"),
                "--output-dir",
                str(output_dir),
                "--json-out",
                str(json_path),
            ]
            with (
                patch("scripts.ata_sessao_reports.cli.parse_ata_sessao_pdf", return_value=_ata_result()),
                patch("scripts.ata_sessao_reports.cli.parse_sd_pdf", return_value=_sd_record()),
                patch(
                    "scripts.ata_sessao_reports.cli.build_logger",
                    return_value=_test_logger("ata-sd-cli"),
                ),
                patch(
                    "scripts.ata_sessao_reports.cli.build_render_logger",
                    return_value=_test_logger("ata-sd-cli-render"),
                ),
                patch.object(sys, "argv", argv),
                redirect_stdout(io.StringIO()),
            ):
                exit_code = main()

            self.assertEqual(exit_code, 0)
            payload = json.loads(json_path.read_text(encoding="utf-8"))
            reconciliation = payload["estimated_value_reconciliation"]
            self.assertEqual(reconciliation["sd_number"], "152/2026")
            self.assertEqual(reconciliation["fully_matched_lots"], 1)
            self.assertEqual(reconciliation["unmatched_lots"], [])
            sd_parsed_path = Path(payload["artifacts"]["sd_parsed_json"])
            self.assertTrue(sd_parsed_path.exists())
            sd_payload = json.loads(sd_parsed_path.read_text(encoding="utf-8"))
            self.assertEqual(sd_payload["metadata"]["numero_sd"], "152/2026")

    def test_sd_structure_error_has_clear_cli_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            argv = [
                "process_ata_sessao_reports.py",
                "--input",
                str(Path(tmp_dir) / "ata.pdf"),
                "--sd-input",
                str(Path(tmp_dir) / "sd.pdf"),
                "--output-dir",
                str(Path(tmp_dir) / "reports"),
            ]
            stderr = io.StringIO()
            with (
                patch("scripts.ata_sessao_reports.cli.parse_ata_sessao_pdf", return_value=_ata_result()),
                patch(
                    "scripts.ata_sessao_reports.cli.parse_sd_pdf",
                    side_effect=SDStructureError("PDF sem texto; aplique OCR."),
                ),
                patch(
                    "scripts.ata_sessao_reports.cli.build_logger",
                    return_value=_test_logger("ata-sd-cli-error"),
                ),
                patch(
                    "scripts.ata_sessao_reports.cli.build_render_logger",
                    return_value=_test_logger("ata-sd-cli-error-render"),
                ),
                patch.object(sys, "argv", argv),
                redirect_stderr(stderr),
            ):
                exit_code = main()

            self.assertEqual(exit_code, 2)
            message = stderr.getvalue()
            self.assertIn("Solicitação de Despesa (SD)", message)
            self.assertIn("texto", message)
            self.assertIn("OCR", message)


if __name__ == "__main__":
    unittest.main()
