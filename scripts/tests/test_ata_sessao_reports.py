from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.ata_sessao_reports.data_normalizer import normalize_report_data, prepare_lote_data
from scripts.ata_sessao_reports.enrichment import apply_estimated_value_enrichment
from scripts.ata_sessao_reports.models import (
    AtaSessaoParseResult,
    LotItemData,
    LotParticipant,
    LotRecord,
    MovimentoLote,
    is_adjudicavel_status,
    is_em_andamento_status,
    is_fase_recursal_status,
)
from scripts.ata_sessao_reports.parser import (
    extract_header_metadata,
    parse_brazilian_number,
    parse_participant_row,
    parse_section_participants,
    parse_status,
    split_lot_blocks,
)
from scripts.ata_sessao_reports.pdf_renderer import write_ata_institucional_pdf


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

    def test_parse_status_em_adjudicacao(self) -> None:
        numero, status, titulo = parse_status(
            'LOTE 2 - EM ADJUDICAÇÃO\nItem adjudicável\nVALORES UNITÁRIOS FINAIS\n'
        )
        self.assertEqual(numero, 2)
        self.assertEqual(status, 'EM ADJUDICAÇÃO')
        self.assertEqual(titulo, 'Item adjudicável')

    def test_parse_status_julgamento(self) -> None:
        numero, status, titulo = parse_status(
            'LOTE 9 - JULGAMENTO\nItem em análise\nVALORES UNITÁRIOS FINAIS\n'
        )
        self.assertEqual(numero, 9)
        self.assertEqual(status, 'JULGAMENTO')
        self.assertEqual(titulo, 'Item em análise')

    def test_parse_status_fase_recursal(self) -> None:
        numero, status, titulo = parse_status(
            'LOTE 15 - INTERPOSIÇÃO DE RECURSOS\nItem em recurso\nVALORES UNITÁRIOS FINAIS\n'
        )
        self.assertEqual(numero, 15)
        self.assertEqual(status, 'INTERPOSIÇÃO DE RECURSOS')
        self.assertEqual(titulo, 'Item em recurso')

    def test_parse_status_uses_secondary_lot_line_as_title(self) -> None:
        numero, status, titulo = parse_status(
            'LOTE 1 - ADJUDICADO\nLOTE 01 - PAPELARIA\nVALORES UNITÁRIOS FINAIS\n'
        )
        self.assertEqual(numero, 1)
        self.assertEqual(status, 'ADJUDICADO')
        self.assertEqual(titulo, 'PAPELARIA')

    def test_split_lot_blocks_ignores_secondary_lot_title_lines(self) -> None:
        blocks = split_lot_blocks(
            '\n'.join([
                'LOTE 1 - ADJUDICADO',
                'LOTE 01 - PAPELARIA',
                'VALORES UNITÁRIOS FINAIS',
                'Item: 1',
                'LOTE 2 - FRACASSADO',
                'LOTE 02 - ARMARINHO',
                'VALORES UNITÁRIOS FINAIS',
                'Item: 1',
            ])
        )
        self.assertEqual(len(blocks), 2)
        self.assertTrue(blocks[0].startswith('LOTE 1 - ADJUDICADO'))
        self.assertIn('LOTE 01 - PAPELARIA', blocks[0])
        self.assertTrue(blocks[1].startswith('LOTE 2 - FRACASSADO'))
        self.assertIn('LOTE 02 - ARMARINHO', blocks[1])

    def test_split_lot_blocks_recognizes_em_adjudicacao_headers(self) -> None:
        blocks = split_lot_blocks(
            '\n'.join([
                'LOTE 1 - EM ADJUDICAÇÃO',
                'Item adjudicado',
                'VALORES UNITÁRIOS FINAIS',
                'Item: 1',
                'LOTE 2 - FRACASSADO',
                'Item malsucedido',
                'VALORES UNITÁRIOS FINAIS',
                'Item: 1',
            ])
        )
        self.assertEqual(len(blocks), 2)
        self.assertTrue(blocks[0].startswith('LOTE 1 - EM ADJUDICAÇÃO'))
        self.assertTrue(blocks[1].startswith('LOTE 2 - FRACASSADO'))

    def test_split_lot_blocks_recognizes_fase_recursal_headers(self) -> None:
        blocks = split_lot_blocks(
            '\n'.join([
                'LOTE 10 - JULGAMENTO DE RECURSOS',
                'Item recursal',
                'VALORES UNITÁRIOS FINAIS',
                'Item: 1',
                'LOTE 11 - FRACASSADO',
                'Item malsucedido',
                'VALORES UNITÁRIOS FINAIS',
                'Item: 1',
            ])
        )
        self.assertEqual(len(blocks), 2)
        self.assertTrue(blocks[0].startswith('LOTE 10 - JULGAMENTO DE RECURSOS'))
        self.assertTrue(blocks[1].startswith('LOTE 11 - FRACASSADO'))

    def test_parse_brazilian_number(self) -> None:
        self.assertEqual(parse_brazilian_number('2.091,72'), 2091.72)
        self.assertEqual(parse_brazilian_number('69,05'), 69.05)
        self.assertIsNone(parse_brazilian_number(''))

    def test_status_groups(self) -> None:
        self.assertTrue(is_em_andamento_status('JULGAMENTO'))
        self.assertTrue(is_em_andamento_status('EM HABILITAÇÃO'))
        self.assertTrue(is_adjudicavel_status('EM ADJUDICAÇÃO'))
        self.assertTrue(is_adjudicavel_status('ADJUDICADO'))
        self.assertTrue(is_fase_recursal_status('INTERPOSIÇÃO DE RECURSOS'))
        self.assertTrue(is_fase_recursal_status('RECEPÇÃO DE CONTRARRAZÕES'))
        self.assertFalse(is_adjudicavel_status('FRACASSADO'))

    def test_build_summary_separates_all_groups(self) -> None:
        result = AtaSessaoParseResult(
            source_path='teste.pdf',
            generated_at='2026-04-22T12:00:00',
            lotes=[
                LotRecord(numero_lote=1, status='JULGAMENTO', titulo='A'),
                LotRecord(numero_lote=2, status='HABILITAÇÃO', titulo='B'),
                LotRecord(numero_lote=3, status='EM ADJUDICAÇÃO', titulo='C'),
                LotRecord(numero_lote=4, status='ADJUDICADO', titulo='D'),
                LotRecord(numero_lote=5, status='INTERPOSIÇÃO DE RECURSOS', titulo='E'),
                LotRecord(numero_lote=6, status='RECEPÇÃO DE CONTRARRAZÕES', titulo='F'),
                LotRecord(numero_lote=7, status='JULGAMENTO DE RECURSOS', titulo='G'),
                LotRecord(numero_lote=8, status='FRACASSADO', titulo='H'),
            ],
        )
        self.assertEqual(
            result.build_summary(),
            {
                'total_lotes': 8,
                'em_andamento': 2,
                'adjudicados': 2,
                'fase_recursal': 3,
                'malsucedidos': 1,
                'warnings': 0,
                'parsing_errors': 0,
            },
        )

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
            itens=[LotItemData(descricao='Descrição teste', quantidade=3, valor_unitario_estimado=9000.0)],
            participantes=[
                LotParticipant(section='DESCLASSIFICADOS', ranking=None, participante_numero='111', razao_social='Fornecedor A', documento='11.111.111/0001-11', oferta_inicial=12000.0, oferta_final=7798.99, diferenca_percentual=None, me_epp=True),
                LotParticipant(section='MOVIMENTOS', ranking=None, participante_numero='111', razao_social='Fornecedor A', documento=None, oferta_inicial=7798.99, oferta_final=None, diferenca_percentual=None, me_epp=None),
            ],
        )
        normalized = prepare_lote_data(lot)
        self.assertEqual(len(normalized.participantes_exibidos), 1)
        self.assertEqual(normalized.participantes_exibidos[0].section, 'DESCLASSIFICADOS')
        self.assertEqual(normalized.melhor_oferta, 7798.99)

    def test_normalizer_uses_movements_only_when_no_structured_rows(self) -> None:
        lot = LotRecord(
            numero_lote=99,
            status='FRACASSADO',
            titulo='Item sem tabela',
            itens=[LotItemData(descricao='Item sem tabela', quantidade=1)],
            participantes=[
                LotParticipant(section='MOVIMENTOS', ranking=None, participante_numero='222', razao_social='Fornecedor Movimento', documento=None, oferta_inicial=1550.0, oferta_final=None, diferenca_percentual=None, me_epp=None),
            ],
        )
        normalized = prepare_lote_data(lot)
        self.assertEqual(len(normalized.participantes_exibidos), 1)
        self.assertEqual(normalized.participantes_exibidos[0].oferta_registrada, 1550.0)
        self.assertIsNone(normalized.participantes_exibidos[0].oferta_final)
        self.assertEqual(normalized.melhor_oferta, 1550.0)

    def test_prepare_lote_data_deduplicates_reason_and_keeps_best_offer(self) -> None:
        lot = LotRecord(
            numero_lote=27,
            status='CANCELADO',
            titulo='Drone',
            itens=[LotItemData(descricao='Drone profissional', quantidade=1)],
            participantes=[
                LotParticipant(section='CLASSIFICACAO', ranking=1, participante_numero='321', razao_social='Fornecedor A', documento='11.111.111/0001-11', oferta_inicial=25000.0, oferta_final=23733.0, diferenca_percentual=3.0, me_epp=False),
            ],
            melhor_lance=None,
            motivo_falha='Erro técnico na cotação | Erro técnico na cotação',
        )
        normalized = prepare_lote_data(lot)
        self.assertEqual(normalized.melhor_oferta, 23733.0)
        self.assertEqual(normalized.motivo_falha, 'Erro técnico na cotação')

    def test_write_ata_institucional_pdf_generates_artifact(self) -> None:
        result = AtaSessaoParseResult(
            source_path='AtaSessaoFinal_teste.pdf',
            generated_at='2026-04-27T09:38:21',
            edital='Pregão Eletrônico Nº PE-001-2026',
            processo_administrativo='123/2026',
            lotes=[
                LotRecord(
                    numero_lote=1,
                    status='FRACASSADO',
                    titulo='Banca metálica',
                    itens=[
                        LotItemData(
                            item_numero='1',
                            unidade='UNID.',
                            descricao='BANCA EM ESTRUTURA METÁLICA',
                            quantidade=1,
                            valor_unitario=1200.0,
                            valor_total=1200.0,
                            valor_unitario_estimado=1200.0,
                        )
                    ],
                    participantes=[
                        LotParticipant(
                            section='INABILITADOS',
                            ranking=None,
                            participante_numero='100',
                            razao_social='FORNECEDOR TESTE LTDA',
                            documento='11.111.111/0001-11',
                            oferta_inicial=1500.0,
                            oferta_final=1200.0,
                            diferenca_percentual=None,
                            me_epp=True,
                        )
                    ],
                    movimentos=[
                        MovimentoLote(
                            timestamp='27/04/2026 09:00:00',
                            evento='INABILITAÇÃO DE PARTICIPANTE',
                            detalhe='Documentação não atendida conforme edital.',
                            raw_text='27/04/2026 09:00:00 INABILITAÇÃO DE PARTICIPANTE Motivo: Documentação não atendida conforme edital.',
                        )
                    ],
                    melhor_lance=1200.0,
                    motivo_falha='Documentação não atendida conforme edital.',
                )
            ],
        )
        normalized = normalize_report_data(
            result,
            metadata={
                'arquivo_origem': 'AtaSessaoFinal_teste.pdf',
                'data_geracao': '2026-04-27T09:38:21',
            },
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            artifacts = write_ata_institucional_pdf(
                result,
                normalized,
                tmp_dir,
                branding={
                    'lines': [
                        'MUNICÍPIO TESTE',
                        'PREFEITURA TESTE',
                        'CNPJ: 00.000.000/0001-00',
                        'RUA TESTE, 1',
                    ],
                    'footer': 'SIREL',
                    'logo_path': None,
                },
                generated_by='Usuário Teste',
            )

            output_path = Path(artifacts['ata_institucional_pdf'])
            self.assertEqual(output_path.name, 'Ata_Institucional_Completa.pdf')
            self.assertTrue(output_path.exists())
            self.assertGreater(output_path.stat().st_size, 1000)

    def test_write_ata_institucional_pdf_splits_oversized_item_row(self) -> None:
        long_description = " ".join(
            [
                "Equipamento hospitalar com especificacoes tecnicas completas,"
                " controles microprocessados e acessorios inclusos."
            ]
            * 40
        )
        result = AtaSessaoParseResult(
            source_path='AtaSessaoFinal_descricao_extensa.pdf',
            generated_at='2026-07-20T10:00:00',
            lotes=[
                LotRecord(
                    numero_lote=1,
                    status='ADJUDICADO',
                    titulo='Equipamento hospitalar',
                    itens=[
                        LotItemData(
                            item_numero='1',
                            unidade='UNID.',
                            descricao=long_description,
                            quantidade=1,
                            valor_unitario=1000.0,
                            valor_total=1000.0,
                        )
                    ],
                )
            ],
        )
        normalized = normalize_report_data(result)

        with tempfile.TemporaryDirectory() as tmp_dir:
            artifacts = write_ata_institucional_pdf(result, normalized, tmp_dir)
            output_path = Path(artifacts['ata_institucional_pdf'])

            self.assertTrue(output_path.exists())
            self.assertGreater(output_path.stat().st_size, 1000)

    def test_apply_estimated_value_enrichment_fills_failed_lot(self) -> None:
        result = AtaSessaoParseResult(
            source_path='ata.pdf',
            generated_at='2026-04-27T09:38:21',
            lotes=[
                LotRecord(
                    numero_lote=1,
                    status='FRACASSADO',
                    titulo='Banca metálica',
                    itens=[
                        LotItemData(
                            item_numero='1',
                            descricao='BANCA EM ESTRUTURA METÁLICA',
                            quantidade=2,
                        )
                    ],
                )
            ],
        )

        metadata = apply_estimated_value_enrichment(
            result,
            {
                'processo': {'id': 10, 'numeroSirel': '2026-001'},
                'warnings': ['Processo sugerido usado para enriquecimento.'],
                'lotes': [
                    {
                        'numero_lote': 1,
                        'item_numero': '1',
                        'valor_unitario_estimado': None,
                        'valor_total_estimado': 5000.0,
                        'fonte_label': 'Dossiê - valores do item',
                        'confianca': 'MEDIA',
                    }
                ],
            },
        )

        item = result.lotes[0].itens[0]
        self.assertIsNotNone(metadata)
        assert metadata is not None
        self.assertEqual(metadata['lotes_enriquecidos'], 1)
        self.assertEqual(item.valor_unitario_estimado, 2500.0)
        self.assertEqual(item.valor_total_estimado, 5000.0)
        self.assertEqual(item.valor_estimado_fonte, 'Dossiê - valores do item')
        self.assertEqual(item.valor_estimado_confianca, 'MEDIA')
        self.assertEqual(item.valor_estimado_processo_fonte, '2026-001')
        self.assertIn('Processo sugerido usado para enriquecimento.', result.warnings)


if __name__ == '__main__':
    unittest.main()
