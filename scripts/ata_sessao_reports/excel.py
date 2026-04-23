from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .models import AtaSessaoParseResult, LotItemData, LotRecord

CURRENCY_FORMAT = '[$R$-416] #,##0.00'
HEADER_FILL = PatternFill(fill_type='solid', fgColor='2440A7')
HEADER_FONT = Font(bold=True, color='FFFFFF', size=11)
BODY_ALIGNMENT = Alignment(vertical='top', wrap_text=True, horizontal='left')
THIN_BORDER = Border(
    left=Side(style='thin'),
    right=Side(style='thin'),
    top=Side(style='thin'),
    bottom=Side(style='thin'),
)


def _first_item(lot: LotRecord) -> LotItemData | None:
    return lot.itens[0] if lot.itens else None


def _sum_quantidade(lot: LotRecord) -> float | None:
    total = sum((item.quantidade or 0) for item in lot.itens)
    return total if total > 0 else None


def _sum_valor_total(lot: LotRecord) -> float | None:
    total = sum((item.valor_total or 0) for item in lot.itens)
    return total if total > 0 else None


def _participant_rows(lots: Iterable[LotRecord]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lot in lots:
        for p in lot.participantes:
            rows.append(
                {
                    'Nº Lote': lot.numero_lote,
                    'Status do Lote': lot.status,
                    'Seção': p.section,
                    'Colocação': p.ranking,
                    'Razão Social': p.razao_social,
                    'Nº Participante': p.participante_numero,
                    'CNPJ/CPF': p.documento,
                    'Oferta Inicial': p.oferta_inicial,
                    'Oferta Final': p.oferta_final,
                    'Dif. (%)': None if p.diferenca_percentual is None else f'{p.diferenca_percentual:.2f}%',
                    'ME/EPP': 'Sim' if p.me_epp else 'Não' if p.me_epp is False else '',
                }
            )
    return rows


def _operacionais_rows(lots: Iterable[LotRecord]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lot in lots:
        item = _first_item(lot)
        rows.append(
            {
                'Nº Lote': lot.numero_lote,
                'Descrição do Lote/1º Item': (item.descricao if item and item.descricao else None) or lot.titulo,
                'Total de Itens': len(lot.itens),
                'Quantidade Total': _sum_quantidade(lot),
                'Valor Total do Lote': _sum_valor_total(lot),
                'Marca (1º item)': item.marca if item and item.marca else '',
                'Modelo (1º item)': item.modelo if item and item.modelo else '',
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
        item = _first_item(lot)
        marca_modelo = ' / '.join(
            part
            for part in [
                item.marca if item and item.marca else None,
                item.modelo if item and item.modelo else None,
            ]
            if part
        )
        rows.append(
            {
                'Nº Lote': lot.numero_lote,
                'Descrição do Lote/1º Item': (item.descricao if item and item.descricao else None) or lot.titulo,
                'Total de Itens': len(lot.itens),
                'Valor Unitário Estimado (1º item)': item.valor_unitario_estimado if item else None,
                'Marca/Modelo (1º item)': marca_modelo,
                'Status': lot.status,
                'Motivo da Falha': lot.motivo_falha or '',
            }
        )
    return rows


def _item_rows(lots: Iterable[LotRecord]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lot in lots:
        if not lot.itens:
            rows.append(
                {
                    'Nº Lote': lot.numero_lote,
                    'Status do Lote': lot.status,
                    'Item': '',
                    'Descrição': lot.titulo,
                    'Unidade': '',
                    'Quantidade': None,
                    'Valor Unitário': None,
                    'Valor Total': None,
                    'Valor Unitário Estimado': None,
                    'Marca': '',
                    'Modelo': '',
                    'Vencedor': lot.vencedor or '',
                    'CNPJ Vencedor': lot.cnpj_vencedor or '',
                }
            )
            continue

        for item in lot.itens:
            rows.append(
                {
                    'Nº Lote': lot.numero_lote,
                    'Status do Lote': lot.status,
                    'Item': item.item_numero or '',
                    'Descrição': item.descricao or lot.titulo,
                    'Unidade': item.unidade or '',
                    'Quantidade': item.quantidade,
                    'Valor Unitário': item.valor_unitario,
                    'Valor Total': item.valor_total,
                    'Valor Unitário Estimado': item.valor_unitario_estimado,
                    'Marca': item.marca or '',
                    'Modelo': item.modelo or '',
                    'Vencedor': lot.vencedor or '',
                    'CNPJ Vencedor': lot.cnpj_vencedor or '',
                }
            )
    return rows


def _format_worksheet(worksheet, currency_columns: set[str]) -> None:
    if worksheet.max_row < 1 or worksheet.max_column < 1:
        return

    for cell in worksheet[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = THIN_BORDER

    for row in worksheet.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = BODY_ALIGNMENT
            cell.border = THIN_BORDER
            header_val = worksheet.cell(row=1, column=cell.column).value
            if header_val in currency_columns and isinstance(cell.value, (int, float)):
                cell.number_format = CURRENCY_FORMAT

    for col_cells in worksheet.columns:
        max_length = 0
        column_letter = get_column_letter(col_cells[0].column)

        for cell in col_cells:
            try:
                length = len(str(cell.value or ''))
                if length > max_length:
                    max_length = length
            except Exception:
                continue

        adjusted_width = min(max(max_length + 2, 14), 60)
        worksheet.column_dimensions[column_letter].width = adjusted_width


def _write_sheet(
    writer: pd.ExcelWriter,
    *,
    sheet_name: str,
    rows: list[dict[str, object]],
    currency_columns: set[str],
    empty_message: str,
) -> None:
    df = pd.DataFrame(rows)
    if df.empty:
        df = pd.DataFrame([{'Aviso': empty_message}])

    df.to_excel(writer, sheet_name=sheet_name, index=False)
    _format_worksheet(writer.sheets[sheet_name], currency_columns)


def write_reports_workbooks(result: AtaSessaoParseResult, output_dir: str | Path) -> dict[str, str]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    andamento_path = output_dir / 'Relatorio_EmAndamento.xlsx'
    adj_path = output_dir / 'Relatorio_Adjudicados.xlsx'
    recursal_path = output_dir / 'Relatorio_FaseRecursal.xlsx'
    mal_path = output_dir / 'Relatorio_MalSucedidos.xlsx'

    with pd.ExcelWriter(andamento_path, engine='openpyxl') as writer:
        _write_sheet(
            writer,
            sheet_name='Em andamento',
            rows=_operacionais_rows(result.em_andamento),
            currency_columns={'Valor Total do Lote', 'Melhor Lance (R$)'},
            empty_message='Nenhum registro encontrado para este relatório.',
        )
        _write_sheet(
            writer,
            sheet_name='Itens',
            rows=_item_rows(result.em_andamento),
            currency_columns={'Valor Unitário', 'Valor Total', 'Valor Unitário Estimado'},
            empty_message='Nenhum item registrado.',
        )
        _write_sheet(
            writer,
            sheet_name='Participantes',
            rows=_participant_rows(result.em_andamento),
            currency_columns={'Oferta Inicial', 'Oferta Final'},
            empty_message='Nenhum participante registrado.',
        )

    with pd.ExcelWriter(adj_path, engine='openpyxl') as writer:
        _write_sheet(
            writer,
            sheet_name='Adjudicados',
            rows=_operacionais_rows(result.adjudicados),
            currency_columns={'Valor Total do Lote', 'Melhor Lance (R$)'},
            empty_message='Nenhum registro encontrado para este relatório.',
        )
        _write_sheet(
            writer,
            sheet_name='Itens',
            rows=_item_rows(result.adjudicados),
            currency_columns={'Valor Unitário', 'Valor Total', 'Valor Unitário Estimado'},
            empty_message='Nenhum item registrado.',
        )
        _write_sheet(
            writer,
            sheet_name='Participantes',
            rows=_participant_rows(result.adjudicados),
            currency_columns={'Oferta Inicial', 'Oferta Final'},
            empty_message='Nenhum participante registrado.',
        )

    with pd.ExcelWriter(recursal_path, engine='openpyxl') as writer:
        _write_sheet(
            writer,
            sheet_name='Fase recursal',
            rows=_operacionais_rows(result.fase_recursal),
            currency_columns={'Valor Total do Lote', 'Melhor Lance (R$)'},
            empty_message='Nenhum registro encontrado para este relatório.',
        )
        _write_sheet(
            writer,
            sheet_name='Itens',
            rows=_item_rows(result.fase_recursal),
            currency_columns={'Valor Unitário', 'Valor Total', 'Valor Unitário Estimado'},
            empty_message='Nenhum item registrado.',
        )
        _write_sheet(
            writer,
            sheet_name='Participantes',
            rows=_participant_rows(result.fase_recursal),
            currency_columns={'Oferta Inicial', 'Oferta Final'},
            empty_message='Nenhum participante registrado.',
        )

    with pd.ExcelWriter(mal_path, engine='openpyxl') as writer:
        _write_sheet(
            writer,
            sheet_name='Malsucedidos',
            rows=_malsucedidos_rows(result.malsucedidos),
            currency_columns={'Valor Unitário Estimado (1º item)'},
            empty_message='Nenhum registro encontrado para este relatório.',
        )
        _write_sheet(
            writer,
            sheet_name='Itens',
            rows=_item_rows(result.malsucedidos),
            currency_columns={'Valor Unitário', 'Valor Total', 'Valor Unitário Estimado'},
            empty_message='Nenhum item registrado.',
        )
        _write_sheet(
            writer,
            sheet_name='Participantes',
            rows=_participant_rows(result.malsucedidos),
            currency_columns={'Oferta Inicial', 'Oferta Final'},
            empty_message='Nenhum participante registrado.',
        )

    return {
        'em_andamento_xlsx': str(andamento_path),
        'adjudicados_xlsx': str(adj_path),
        'fase_recursal_xlsx': str(recursal_path),
        'malsucedidos_xlsx': str(mal_path),
    }
