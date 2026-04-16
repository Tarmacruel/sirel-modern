from __future__ import annotations

import unittest
from decimal import Decimal
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys
import types

PACKAGE_DIR = Path(__file__).resolve().parents[1] / "ata_sessao_reports"
package = types.ModuleType("ata_sessao_reports")
package.__path__ = [str(PACKAGE_DIR)]
sys.modules.setdefault("ata_sessao_reports", package)

MODELS_SPEC = spec_from_file_location("ata_sessao_reports.models", PACKAGE_DIR / "models.py")
assert MODELS_SPEC and MODELS_SPEC.loader
MODELS_MODULE = module_from_spec(MODELS_SPEC)
sys.modules["ata_sessao_reports.models"] = MODELS_MODULE
MODELS_SPEC.loader.exec_module(MODELS_MODULE)

SD_SPEC = spec_from_file_location("ata_sessao_reports.sd_parser", PACKAGE_DIR / "sd_parser.py")
assert SD_SPEC and SD_SPEC.loader
SD_MODULE = module_from_spec(SD_SPEC)
sys.modules["ata_sessao_reports.sd_parser"] = SD_MODULE
SD_SPEC.loader.exec_module(SD_MODULE)

SDItemExtractionError = SD_MODULE.SDItemExtractionError
_extract_metadata = SD_MODULE._extract_metadata
_extract_items_from_table_rows = SD_MODULE._extract_items_from_table_rows
map_sd_item_to_lot_item = SD_MODULE.map_sd_item_to_lot_item
parse_sd_text = SD_MODULE.parse_sd_text


class SDParserTests(unittest.TestCase):
    def test_parse_sd_text_extracts_metadata_and_items(self) -> None:
        text = """
PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS
Solicitação de Despesa SD 152/2026
Data: 18/03/2026
Centro de Custo: 0000009 - SECRETARIA MUNICIPAL DE INFRAESTRUTURA E SERVIÇOS URBANOS
Unidade Orçamentária: 0901 - SECRETARIA MUNICIPAL DE INFRAESTRUTURA E SERVIÇOS URBANOS
Elemento da Despesa: 3.3.90.30
Fonte de Recurso: 15000000
Processo Administrativo Nº 152/2026
01 123456 BRITA GRADUADA SIMPLES FAIXA C 1.000,00 100,00 M3 120,50 120.500,00
02 654321 AREIA LAVADA GROSSA PARA BASE 800,00 100,00 M3 95,00 76.000,00
Valor Total: R$ 196.500,00
"""
        result = parse_sd_text(text, source_path="SD-152-2026.pdf")

        self.assertEqual(result.metadata.numero_sd, "152/2026")
        self.assertEqual(result.metadata.data_emissao, "18/03/2026")
        self.assertEqual(len(result.itens), 2)
        self.assertEqual(result.metadata.valor_total, Decimal("196500.00"))
        self.assertFalse(result.warnings)

    def test_parse_sd_text_supports_multiline_description_and_unit_with_dot(self) -> None:
        text = """
SD 190/2026
001 9000515389 ALFINETE NIQUELADO: Alfinete niquelado número 32.
Embalagem com 50 unidades. 20,00 1,00 m. 8,72 174,40
Valor Total: R$ 174,40
"""
        result = parse_sd_text(text)
        self.assertEqual(len(result.itens), 1)
        self.assertEqual(result.itens[0].numero, 1)
        self.assertEqual(result.itens[0].unidade, "M.")
        self.assertIn("ALFINETE NIQUELADO", result.itens[0].descricao)

    def test_parse_sd_text_warns_total_divergence(self) -> None:
        text = """
SD 200/2026
Data: 20/03/2026
01 123456 CIMENTO CP II 10,00 100,00 SC 30,00 300,00
Valor Total: R$ 500,00
"""
        result = parse_sd_text(text)
        self.assertTrue(any("divergente" in warning for warning in result.warnings))

    def test_parse_sd_text_raises_when_no_items(self) -> None:
        text = """
SD 300/2026
Data: 21/03/2026
Valor Total: R$ 0,00
"""
        with self.assertRaises(SDItemExtractionError):
            parse_sd_text(text)

    def test_map_sd_item_to_lot_item(self) -> None:
        text = """
SD 301/2026
01 123456 TUBO DE CONCRETO ARMADO 12,00 100,00 UN 200,00 2.400,00
"""
        record = parse_sd_text(text)
        mapped = map_sd_item_to_lot_item(record.itens[0])
        self.assertEqual(mapped.item_numero, "001")
        self.assertEqual(mapped.valor_total, 2400.0)

    def test_extract_items_from_table_rows_handles_wrapped_description(self) -> None:
        rows = [
            ["ITEM", "CATMAT/CATSER", "DESCRIÇÃO / ESPECIFICAÇÃO", "QTD.", "PER.", "UNID", "PREÇO", "TOTAL"],
            ["001", "9007000131", "Bola de handebol profissional tamanho H2", "45,00", "1,00", "UND", "224,51", "10.102,95"],
            ["", "", "Complemento da descrição em linha extra", "", "", "", "", ""],
            ["002", "36848", "Bola de handebol profissional tamanho H3", "45,00", "1,00", "UND", "282,50", "12.712,50"],
        ]
        items, warnings = _extract_items_from_table_rows(rows)
        self.assertEqual(len(items), 2)
        self.assertFalse(warnings)
        self.assertIn("Complemento da descrição", items[0].descricao)
        self.assertEqual(items[1].preco_total, Decimal("12712.50"))

    def test_extract_metadata_prioritizes_sd_number_and_total(self) -> None:
        text = """
CNPJ: 13.650.403/0001-28
N° 190 / 2026
ASSUNTO / OBJETO SOLICITADO: Teixeira de Freitas, BA 19/03/2026
Contratação de empresa especializada em fornecimento de materiais.
Valor Total: 496.110,54
"""
        metadata = _extract_metadata(text)
        self.assertEqual(metadata.numero_sd, "190/2026")
        self.assertEqual(metadata.processo_administrativo, "190/2026")
        self.assertEqual(metadata.assunto_objeto, "Contratação de empresa especializada em fornecimento de materiais.")
        self.assertEqual(metadata.valor_total, Decimal("496110.54"))
        self.assertEqual(len(metadata.classificacoes_orcamentarias), 0)

    def test_extract_items_from_table_rows_handles_page_break_columns(self) -> None:
        rows = [
            ["021", "", "9900515408 LIXA GRAO 150:Folha tipo grao 150", "360,00", "1,00", "UND", "1,51", "543,60"],
            ["022", "", "", "310,00", "1,00", "", "", ""],
            ["", "9900515409", "LIXA GRAO 50:Folha tipo grao 50, fabricada com costado", "", "", "UND", "1,55", "480,50"],
            ["023", "", "PALITO DE PICOLÉ", "120,00", "1,00", "PC", "3,17", "380,40"],
        ]
        items, warnings = _extract_items_from_table_rows(rows)
        self.assertEqual(len(items), 3)
        item_22 = items[1]
        self.assertEqual(item_22.numero, 22)
        self.assertEqual(item_22.catmat_catser, "9900515409")
        self.assertEqual(item_22.unidade, "UND")
        self.assertEqual(item_22.preco_total, Decimal("480.50"))
        self.assertFalse(warnings)

    def test_extract_items_from_table_rows_handles_page_break_shifted_cells(self) -> None:
        rows = [
            ["022", "", "", "310,00", "1,00", "", "", ""],
            ["9900515409 LIXA GRAO 50:Folha tipo grao 50", "UND", "1,55", "480,50"],
            ["023", "", "PALITO DE PICOLÉ", "120,00", "1,00", "PC", "3,17", "380,40"],
        ]
        items, warnings = _extract_items_from_table_rows(rows)
        self.assertEqual(len(items), 2)
        item_22 = items[0]
        self.assertEqual(item_22.numero, 22)
        self.assertEqual(item_22.catmat_catser, "9900515409")
        self.assertEqual(item_22.unidade, "UND")
        self.assertEqual(item_22.preco_unitario, Decimal("1.55"))
        self.assertEqual(item_22.preco_total, Decimal("480.50"))
        self.assertFalse(warnings)

    def test_extract_items_from_table_rows_keeps_existing_prices_from_primary_row(self) -> None:
        rows = [
            ["022", "", "", "310,00", "1,00", "UND", "1,55", "480,50"],
            ["9900515409 LIXA GRAO 50:Folha tipo grao 50", "UND", "99,99", "999,99"],
            ["023", "", "PALITO DE PICOLÉ", "120,00", "1,00", "PC", "3,17", "380,40"],
        ]

        items, warnings = _extract_items_from_table_rows(rows)

        self.assertEqual(len(items), 2)
        item_22 = items[0]
        self.assertEqual(item_22.numero, 22)
        self.assertEqual(item_22.catmat_catser, "9900515409")
        self.assertEqual(item_22.unidade, "UND")
        self.assertEqual(item_22.preco_unitario, Decimal("1.55"))
        self.assertEqual(item_22.preco_total, Decimal("480.50"))
        self.assertFalse(warnings)

    def test_extract_metadata_collects_multiple_classificacoes(self) -> None:
        text = """
N° 190/2026
ASSUNTO / OBJETO SOLICITADO:
Objeto de teste
JUSTIFICATIVA:
CLASSIFICAÇÃO ORÇAMENTÁRIA
Cód. Reduzido: 2038301500000
Unidade Orçamentária: 0501 - SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO
Projeto / Atividade: 2038 - MANUTENÇÃO
Elemento da Despesa: 3390300000 - Material de Consumo
Fonte de Recurso: 15000000 - Recursos não Vinculados de Impostos PM
CLASSIFICAÇÃO ORÇAMENTÁRIA
Cód. Reduzido: 22073015001002
Unidade Orçamentária: 0802 - FUNDO MUNICIPAL DE SAÚDE
Projeto / Atividade: 2207 - MANUTENÇÃO
Elemento da Despesa: 3390300000 - Material de Consumo
Fonte de Recurso: 15001002 - Recursos não Vinculados de Impostos
"""
        metadata = _extract_metadata(text)
        self.assertEqual(len(metadata.classificacoes_orcamentarias), 2)
        self.assertIn("0501 - SECRETARIA", metadata.classificacoes_orcamentarias[0].unidade_orcamentaria or "")
        self.assertIn("0802 - FUNDO", metadata.classificacoes_orcamentarias[1].unidade_orcamentaria or "")


if __name__ == "__main__":
    unittest.main()
