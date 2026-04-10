from __future__ import annotations

import unittest

from scripts.ata_sessao_reports.parser import (
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


if __name__ == '__main__':
    unittest.main()
