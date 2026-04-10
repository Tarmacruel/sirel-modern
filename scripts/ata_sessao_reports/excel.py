from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .models import AtaSessaoParseResult, LotParticipant, LotRecord

CURRENCY_FORMAT = '[$R$-416] #,##0.00'
HEADER_FILL = PatternFill(fill_type='solid', fgColor='2440A7')
HEADER_FONT = Font(bold=True, color='FFFFFF')
BODY_ALIGNMENT = Alignment(vertical='top', wrap_text=True)


def _participant_rows(lots: Iterable[LotRecord]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lot in lots:
        for participant in lot.participantes:
            rows.append(
                {
                    'Nº Lote': lot.numero_lote,
                    'Status do Lote': lot.status,
                    'Seção': participant.section,
                    'Colocação': participant.ranking,
                    'Razão Social': participant.razao_social,
                    'Nº Participante': participant.participante_numero,
                    'CNPJ/CPF': participant.documento,
                    'Oferta Inicial': participant.oferta_inicial,
                    'Oferta Final': participant.oferta_final,
                    'Dif. (%)': None if participant.diferenca_percentual is None else f"{participant.diferenca_percentual:.2f}%",
                    'ME/EPP': 'Sim' if participant.me_epp else 'Não' if participant.me_epp is False else '',
                }
            )
    return rows


def _adjudicados_rows(lots: Iterable[LotRecord]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lot in lots:
        rows.append(
            {
                'Nº Lote': lot.numero_lote,
                'Descrição do Item': lot.item.descricao or lot.titulo,
                'Quantidade': lot.item.quantidade,
                'Valor Unitário': lot.item.valor_unitario,
                'Valor Total': lot.item.valor_total,
                'Marca': lot.item.marca or '',
                'Modelo': lot.item.modelo or '',
                'Status': lot.status,
                'Vencedor': lot.vencedor or '',
                'CNPJ Vencedor': lot.cnpj_vencedor or '',
                'Melhor Lance (R$)': lot.melhor_lance,
            }
        )
    return rows


def _malsucedidos_rows(lots: Iterable[LotRecord]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lot in lots:
        rows.append(
            {
                'Nº Lote': lot.numero_lote,
                'Descrição do Item': lot.item.descricao or lot.titulo,
                'Quantidade': lot.item.quantidade,
                'Valor Unitário Estimado': lot.item.valor_unitario_estimado,
                'Marca/Modelo': ' / '.join(filter(None, [lot.item.marca, lot.item.modelo])),
                'Status': lot.status,
                'Motivo da Falha': lot.motivo_falha or '',
            }
        )
    return rows


def _write_dataframe(writer: pd.ExcelWriter, sheet_name: str, rows: list[dict[str, object]]) -> None:
    df = pd.DataFrame(rows)
    if df.empty:
        df = pd.DataFrame([{'Aviso': 'Nenhum registro encontrado para este relatório.'}])
    df.to_excel(writer, sheet_name=sheet_name, index=False)


def _format_worksheet(path: Path, currency_columns: set[str]) -> None:
    workbook = load_workbook(path)
    for worksheet in workbook.worksheets:
        worksheet.freeze_panes = 'A2'
        worksheet.auto_filter.ref = worksheet.dimensions
        for cell in worksheet[1]:
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal='center', vertical='center')
        for column_cells in worksheet.columns:
            column_letter = get_column_letter(column_cells[0].column)
            max_length = 0
            header_value = str(column_cells[0].value or '')
            for cell in column_cells:
                cell.alignment = BODY_ALIGNMENT
                text_length = len(str(cell.value or ''))
                max_length = max(max_length, text_length)
                if header_value in currency_columns and cell.row > 1 and isinstance(cell.value, (int, float)):
                    cell.number_format = CURRENCY_FORMAT
            worksheet.column_dimensions[column_letter].width = min(max(max_length + 2, 14), 48)
    workbook.save(path)


def write_reports_workbooks(result: AtaSessaoParseResult, output_dir: str | Path) -> dict[str, str]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    adjudicados_path = output_dir / 'Relatorio_Adjudicados.xlsx'
    malsucedidos_path = output_dir / 'Relatorio_MalSucedidos.xlsx'

    with pd.ExcelWriter(adjudicados_path, engine='openpyxl') as writer:
        _write_dataframe(writer, 'Adjudicados', _adjudicados_rows(result.adjudicados))
        _write_dataframe(writer, 'Classificacao', _participant_rows(result.adjudicados))

    with pd.ExcelWriter(malsucedidos_path, engine='openpyxl') as writer:
        _write_dataframe(writer, 'Fracassados_Desertos', _malsucedidos_rows(result.malsucedidos))
        _write_dataframe(writer, 'Participantes', _participant_rows(result.malsucedidos))

    _format_worksheet(adjudicados_path, {'Valor Unitário', 'Valor Total', 'Melhor Lance (R$)'})
    _format_worksheet(malsucedidos_path, {'Valor Unitário Estimado'})

    return {
        'adjudicados_xlsx': str(adjudicados_path),
        'malsucedidos_xlsx': str(malsucedidos_path),
    }
