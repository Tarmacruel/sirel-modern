from __future__ import annotations

import unittest

from scripts.ata_sessao_reports.data_normalizer import normalize_lot, prepare_lote_data
from scripts.ata_sessao_reports.models import LotItemData, LotParticipant, LotRecord
from scripts.ata_sessao_reports.parser import (
    extract_header_metadata,
    parse_brazilian_number,
    parse_participant_row,
    parse_section_participants,
    parse_status,
)


class AtaSessaoParserTests(unittest.TestCase):
    def test_parse_status(self) -> None:
        numero, status, titulo = parse_status(
            'LOTE 3 - FRACASSADO\nItem de teste\nVALORES UNITÁRIOS FINAIS\n'
        )
        self.assertEqual(numero, 3)
        self.assertEqual(status, 'FRACASSADO')
        self.assertEqual(titulo, 'Item de teste')

    def test_parse_status_habilitacao(self) -> None:
        numero, status, titulo = parse_status(
            'LOTE 2 - HABILITAÇÃO\nItem em análise\nVALORES UNITÁRIOS FINAIS\n'
        )
        self.assertEqual(numero, 2)
        self.assertEqual(status, 'HABILITAÇÃO')
        self.assertEqual(titulo, 'Item em análise')

    def test_parse_brazilian_number(self) -> None:
        self.assertEqual(parse_brazilian_number('2.091,72'), 2091.72)
        self.assertEqual(parse_brazilian_number('69,05'), 69.05)
        self.assertIsNone(parse_brazilian_number(''))

    def test_extract_header_metadata(self) -> None:
        edital, processo = extract_header_metadata(
            'PREGÃO ELETRÔNICO Nº PE-002-2026\nProcesso Administrativo Nº 1474/2025\n'
        )
        self.assertEqual(edital, 'Pregão Eletrônico Nº PE-002-2026')
        self.assertEqual(processo, '1474/2025')

    def test_parse_participant_row(self) -> None:
        row = parse_participant_row('1 VERLUMA COMERCIO LTDA 853 63.679.550/0001-07 7.020,00 2.010,00 Sim')
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row.ranking, 1)
        self.assertEqual(row.participante_numero, '853')
        self.assertEqual(row.documento, '63.679.550/0001-07')
        self.assertEqual(row.oferta_final, 2010.0)
        self.assertTrue(row.me_epp)

    def test_parse_section_participants_with_wrapped_name(self) -> None:
        warnings: list[str] = []
        rows = parse_section_participants(
            'DESCLASSIFICADOS',
            '\n'.join([
                'Razão Social Num Documento Oferta Inicial Oferta Final Dif.(%) ME',
                'EGIDE COMERCIO DE VESTUARIO E 793 02.309.765/0001-33 34.000,00 32.293,14 Sim',
                'ELETRODOMESTICOS LTDA',
                'COMERCIAL USUAL LTDA - EPP 830 14.050.075/0001-91 100.000,00 49.900,00 54,5220 Sim',
            ]),
            logger=__import__('logging').getLogger('test'),
            warnings=warnings,
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].razao_social, 'EGIDE COMERCIO DE VESTUARIO E ELETRODOMESTICOS LTDA')
        self.assertEqual(rows[1].diferenca_percentual, 54.522)
        self.assertFalse(warnings)

    def test_normalizer_prioritizes_structured_sections_and_best_offer(self) -> None:
        lot = LotRecord(
            numero_lote=32,
            status='FRACASSADO',
            titulo='Item teste',
            item=LotItemData(descricao='Descrição teste', quantidade=3, valor_unitario_estimado=9000.0),
            participantes=[
                LotParticipant(section='DESCLASSIFICADOS', ranking=None, participante_numero='111', razao_social='Fornecedor A', documento='11.111.111/0001-11', oferta_inicial=12000.0, oferta_final=7798.99, diferenca_percentual=None, me_epp=True),
                LotParticipant(section='MOVIMENTOS', ranking=None, participante_numero='111', razao_social='Fornecedor A', documento=None, oferta_inicial=7798.99, oferta_final=None, diferenca_percentual=None, me_epp=None),
            ],
        )
        normalized = normalize_lot(lot)
        self.assertEqual(len(normalized.participantes_exibidos), 1)
        self.assertEqual(normalized.participantes_exibidos[0].section, 'DESCLASSIFICADOS')
        self.assertEqual(normalized.melhor_oferta, 7798.99)

    def test_normalizer_uses_movements_only_when_no_structured_rows(self) -> None:
        lot = LotRecord(
            numero_lote=99,
            status='FRACASSADO',
            titulo='Item sem tabela',
            item=LotItemData(descricao='Item sem tabela', quantidade=1),
            participantes=[
                LotParticipant(section='MOVIMENTOS', ranking=None, participante_numero='222', razao_social='Fornecedor Movimento', documento=None, oferta_inicial=1550.0, oferta_final=None, diferenca_percentual=None, me_epp=None),
            ],
        )
        normalized = normalize_lot(lot)
        self.assertEqual(len(normalized.participantes_exibidos), 1)
        self.assertEqual(normalized.participantes_exibidos[0].oferta_registrada, 1550.0)
        self.assertIsNone(normalized.participantes_exibidos[0].oferta_final)
        self.assertEqual(normalized.melhor_oferta, 1550.0)

    def test_prepare_lote_data_deduplicates_reason_and_keeps_best_offer(self) -> None:
        lot = LotRecord(
            numero_lote=27,
            status='CANCELADO',
            titulo='Drone',
            item=LotItemData(descricao='Drone profissional', quantidade=1),
            participantes=[
                LotParticipant(section='CLASSIFICACAO', ranking=1, participante_numero='321', razao_social='Fornecedor A', documento='11.111.111/0001-11', oferta_inicial=25000.0, oferta_final=23733.0, diferenca_percentual=3.0, me_epp=False),
            ],
            melhor_lance=None,
            motivo_falha='Erro técnico na cotação | Erro técnico na cotação',
        )
        normalized = prepare_lote_data(lot)
        self.assertEqual(normalized.melhor_oferta, 23733.0)
        self.assertEqual(normalized.motivo_falha, 'Erro técnico na cotação')


if __name__ == '__main__':
    unittest.main()
