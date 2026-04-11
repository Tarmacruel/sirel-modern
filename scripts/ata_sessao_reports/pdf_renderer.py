from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .data_normalizer import NormalizedLot, NormalizedParticipant, NormalizedReportData, SECTION_LABELS

PAGE_SIZE = landscape(A4)
PAGE_WIDTH, PAGE_HEIGHT = PAGE_SIZE
LEFT_MARGIN = 12 * mm
RIGHT_MARGIN = 12 * mm
TOP_MARGIN = 28 * mm
BOTTOM_MARGIN = 16 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN

PRIMARY = colors.HexColor('#2440A7')
INK = colors.HexColor('#1f2937')
MUTED = colors.HexColor('#5b6b83')
BORDER = colors.HexColor('#c6d1df')
HEADER_BG = colors.HexColor('#dbe4f0')
PANEL_BG = colors.HexColor('#f8fafc')
WHITE = colors.white


@dataclass(slots=True)
class BrandingConfig:
    lines: list[str]
    footer_text: str
    logo_path: str | None
    generated_by: str


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        'title': ParagraphStyle('AtaTitle', parent=base['Heading1'], fontName='Helvetica-Bold', fontSize=22, leading=26, textColor=INK, alignment=TA_LEFT, spaceAfter=4),
        'subtitle': ParagraphStyle('AtaSubtitle', parent=base['BodyText'], fontName='Helvetica', fontSize=10.5, leading=13, textColor=MUTED, alignment=TA_LEFT, spaceAfter=12),
        'section_center': ParagraphStyle('SectionCenter', parent=base['Heading2'], fontName='Helvetica-Bold', fontSize=11, leading=13, textColor=INK, alignment=TA_CENTER, spaceBefore=8, spaceAfter=8, tracking=0.5),
        'lot_title': ParagraphStyle('LotTitle', parent=base['Heading2'], fontName='Helvetica-Bold', fontSize=12, leading=14, textColor=INK, alignment=TA_CENTER, spaceBefore=8, spaceAfter=6),
        'body': ParagraphStyle('AtaBody', parent=base['BodyText'], fontName='Helvetica', fontSize=9.3, leading=12, textColor=INK, alignment=TA_LEFT),
        'body_justify': ParagraphStyle('AtaBodyJustify', parent=base['BodyText'], fontName='Helvetica', fontSize=9.3, leading=12, textColor=INK, alignment=TA_JUSTIFY),
        'table_header': ParagraphStyle('TableHeader', parent=base['BodyText'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=INK, alignment=TA_LEFT),
        'table_cell': ParagraphStyle('TableCell', parent=base['BodyText'], fontName='Helvetica', fontSize=8.5, leading=10.5, textColor=INK, alignment=TA_LEFT),
        'table_cell_center': ParagraphStyle('TableCellCenter', parent=base['BodyText'], fontName='Helvetica', fontSize=8.5, leading=10.5, textColor=INK, alignment=TA_CENTER),
        'table_cell_justify': ParagraphStyle('TableCellJustify', parent=base['BodyText'], fontName='Helvetica', fontSize=8.4, leading=10.4, textColor=INK, alignment=TA_JUSTIFY),
        'card_label': ParagraphStyle('CardLabel', parent=base['BodyText'], fontName='Helvetica-Bold', fontSize=7.4, leading=9, textColor=MUTED, alignment=TA_LEFT),
        'card_value': ParagraphStyle('CardValue', parent=base['BodyText'], fontName='Helvetica-Bold', fontSize=11, leading=13, textColor=INK, alignment=TA_LEFT),
        'muted': ParagraphStyle('AtaMuted', parent=base['BodyText'], fontName='Helvetica', fontSize=8.5, leading=10.5, textColor=MUTED, alignment=TA_LEFT),
    }


def _format_currency(value: float | None) -> str:
    if value is None or value <= 0:
        return '-'
    return f'R$ {value:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def _format_number(value: float | None, decimals: int = 3) -> str:
    if value is None:
        return '-'
    text = f'{value:,.{decimals}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return text.rstrip('0').rstrip(',') if ',' in text else text


def _text(value: Any) -> str:
    text = str(value or '').strip()
    return text or '-'


def _shorten(value: str | None, max_length: int) -> str:
    text = ' '.join(str(value or '').split())
    if not text:
        return '-'
    return text if len(text) <= max_length else f'{text[: max_length - 1].rstrip()}…'


def _cards_table(cards: list[tuple[str, str]], styles: dict[str, ParagraphStyle], columns: int = 4) -> Table:
    rows: list[list[Any]] = []
    row: list[Any] = []
    card_width = (CONTENT_WIDTH - ((columns - 1) * 8)) / columns
    for index, (label, value) in enumerate(cards, start=1):
        content = [Paragraph(label.upper(), styles['card_label']), Spacer(1, 2), Paragraph(value, styles['card_value'])]
        row.append(Table([[content]], colWidths=[card_width]))
        if index % columns == 0:
            rows.append(row)
            row = []
    if row:
        while len(row) < columns:
            row.append('')
        rows.append(row)

    table = Table(rows, colWidths=[card_width] * columns, hAlign='LEFT', spaceBefore=0, spaceAfter=8)
    style_commands: list[tuple[Any, ...]] = [
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]
    for row_index, row_values in enumerate(rows):
        for col_index, cell in enumerate(row_values):
            if cell == '':
                continue
            style_commands.extend([
                ('BOX', (col_index, row_index), (col_index, row_index), 1, BORDER),
                ('BACKGROUND', (col_index, row_index), (col_index, row_index), WHITE),                ('VALIGN', (col_index, row_index), (col_index, row_index), 'MIDDLE'),
                ('LEFTPADDING', (col_index, row_index), (col_index, row_index), 10),
                ('RIGHTPADDING', (col_index, row_index), (col_index, row_index), 10),
                ('TOPPADDING', (col_index, row_index), (col_index, row_index), 8),
                ('BOTTOMPADDING', (col_index, row_index), (col_index, row_index), 8),
            ])
    table.setStyle(TableStyle(style_commands))
    return table


def _make_table(headers: list[str], rows: list[list[Any]], col_widths: list[float], styles: dict[str, ParagraphStyle], justify_columns: set[int] | None = None) -> Table:
    justify_columns = justify_columns or set()
    data: list[list[Any]] = [[Paragraph(header, styles['table_header']) for header in headers]]
    for row in rows:
        rendered_row: list[Any] = []
        for index, value in enumerate(row):
            if isinstance(value, Paragraph):
                rendered_row.append(value)
            else:
                style_key = 'table_cell_justify' if index in justify_columns else 'table_cell'
                rendered_row.append(Paragraph(_text(value), styles[style_key]))
        data.append(rendered_row)

    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign='LEFT', splitByRow=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), INK),
        ('GRID', (0, 0), (-1, -1), 0.8, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, PANEL_BG]),
    ]))
    return table


def _summary_rows_adjudicados(lots: list[NormalizedLot], styles: dict[str, ParagraphStyle]) -> list[list[Any]]:
    rows: list[list[Any]] = []
    for lot in lots:
        rows.append([
            _text(lot.numero_lote),
            Paragraph(_shorten(lot.descricao, 90), styles['table_cell_justify']),
            _format_number(lot.quantidade),
            _format_currency(lot.valor_unitario),
            _format_currency(lot.valor_total),
            _text(lot.marca),
            _text(lot.modelo),
            _text(lot.status),
            _text(lot.vencedor),
            _text(lot.cnpj_vencedor),
            _format_currency(lot.melhor_oferta),
        ])
    return rows


def _summary_rows_malsucedidos(lots: list[NormalizedLot], styles: dict[str, ParagraphStyle]) -> list[list[Any]]:
    rows: list[list[Any]] = []
    for lot in lots:
        rows.append([
            _text(lot.numero_lote),
            _text(lot.status),
            Paragraph(_shorten(lot.descricao, 108), styles['table_cell_justify']),
            _format_number(lot.quantidade),
            _text(lot.participantes_totais),
            _format_currency(lot.melhor_oferta),
            Paragraph(_shorten(lot.motivo_falha, 130), styles['table_cell_justify']),
        ])
    return rows


def _participant_table_for_section(section: str, participants: list[NormalizedParticipant], styles: dict[str, ParagraphStyle]) -> list[Any]:
    story: list[Any] = [Paragraph(SECTION_LABELS[section].upper(), styles['section_center'])]
    if section == 'MOVIMENTOS':
        rows = [
            [
                _text(item.participante_numero),
                item.razao_social,
                _format_currency(item.oferta_registrada),
            ]
            for item in participants
        ]
        table = _make_table(
            ['Part.', 'Razão Social', 'Oferta registrada no movimento'],
            rows,
            [48, 470, 140],
            styles,
        )
        story.append(table)
        return story

    rows = [
        [
            _text(item.ranking),
            item.razao_social,
            _text(item.documento),
            _format_currency(item.oferta_inicial),
            _format_currency(item.oferta_final),
            '-' if item.diferenca_percentual is None else f'{item.diferenca_percentual:.2f}%'.replace('.', ','),
            'Sim' if item.me_epp else 'Não' if item.me_epp is False else '-',
        ]
        for item in participants
    ]
    table = _make_table(
        ['Class.', 'Razão Social', 'CNPJ/CPF', 'Oferta Inicial', 'Oferta Final', 'Dif.(%)', 'ME/EPP'],
        rows,
        [42, 278, 120, 84, 84, 62, 54],
        styles,
    )
    story.append(table)
    return story


def _lot_story(lot: NormalizedLot, styles: dict[str, ParagraphStyle], include_reason: bool) -> list[Any]:
    intro: list[Any] = [
        Paragraph(f'LOTE {lot.numero_lote} - {lot.status}', styles['lot_title']),
        Paragraph(lot.descricao or '-', styles['body_justify']),
        Spacer(1, 5),
        _cards_table([
            ('Quantidade', _format_number(lot.quantidade)),
            ('Marca', _text(lot.marca)),
            ('Modelo', _text(lot.modelo)),
            ('Participantes', _text(lot.participantes_totais)),
            ('Classificados', _text(lot.classificados)),
            ('Desclassificados', _text(lot.desclassificados)),
            ('Inabilitados', _text(lot.inabilitados)),
            ('Melhor oferta', _format_currency(lot.melhor_oferta)),
        ], styles, columns=4),
    ]
    if include_reason:
        reason_table = Table(
            [[Paragraph('MOTIVO CONSOLIDADO', styles['card_label'])], [Paragraph(_text(lot.motivo_falha), styles['body_justify'])]],
            colWidths=[CONTENT_WIDTH],
            hAlign='LEFT',
        )
        reason_table.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 1, BORDER),
            ('BACKGROUND', (0, 0), (-1, 0), PANEL_BG),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        intro.extend([reason_table, Spacer(1, 6)])

    story: list[Any] = [KeepTogether(intro)]
    sections: dict[str, list[NormalizedParticipant]] = {}
    for participant in lot.participantes_exibidos:
        sections.setdefault(participant.section, []).append(participant)

    ordered_sections = ['CLASSIFICACAO', 'DESCLASSIFICADOS', 'INABILITADOS', 'MOVIMENTOS']
    for section in ordered_sections:
        participants = sections.get(section) or []
        if not participants:
            continue
        story.extend(_participant_table_for_section(section, participants, styles))
        story.append(Spacer(1, 8))
    story.append(Spacer(1, 10))
    return story


def _page_decorations(canvas, doc, branding: BrandingConfig):
    canvas.saveState()
    if branding.logo_path and Path(branding.logo_path).exists():
        canvas.drawImage(branding.logo_path, LEFT_MARGIN, PAGE_HEIGHT - 20 * mm, width=38 * mm, height=14 * mm, preserveAspectRatio=True, mask='auto')
    text_x = LEFT_MARGIN + 44 * mm
    header_y = PAGE_HEIGHT - 10 * mm
    canvas.setFillColor(PRIMARY)
    canvas.setFont('Helvetica-Bold', 9)
    canvas.drawString(text_x, header_y, branding.lines[0])
    canvas.setFillColor(INK)
    canvas.setFont('Helvetica-Bold', 8.6)
    canvas.drawString(text_x, header_y - 10, branding.lines[1])
    canvas.setFillColor(MUTED)
    canvas.setFont('Helvetica', 7.8)
    canvas.drawString(text_x, header_y - 19, branding.lines[2])
    canvas.drawString(text_x, header_y - 28, branding.lines[3])

    footer_y = 10 * mm
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.8)
    canvas.line(LEFT_MARGIN, footer_y + 10, PAGE_WIDTH - RIGHT_MARGIN, footer_y + 10)
    canvas.setFillColor(MUTED)
    canvas.setFont('Helvetica', 7.2)
    canvas.drawString(LEFT_MARGIN, footer_y, f'Gerado por: {branding.generated_by}')
    canvas.drawCentredString(PAGE_WIDTH / 2, footer_y, f'{branding.footer_text} | Desenvolvido por Jonatas da Silva Sousa')
    canvas.drawRightString(PAGE_WIDTH - RIGHT_MARGIN, footer_y, f'Página {canvas.getPageNumber()}')
    canvas.restoreState()


def _build_pdf(path: Path, report_title: str, subtitle: str, report_cards: list[tuple[str, str]], summary_headers: list[str], summary_rows: list[list[Any]], summary_widths: list[float], lots: list[NormalizedLot], branding: BrandingConfig, include_reason: bool) -> None:
    styles = _styles()
    doc = SimpleDocTemplate(
        str(path),
        pagesize=PAGE_SIZE,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
        title=report_title,
        author=branding.generated_by,
    )

    story: list[Any] = [
        Paragraph(report_title, styles['title']),
        Paragraph(subtitle, styles['subtitle']),
        _cards_table(report_cards, styles, columns=4),
        Spacer(1, 6),
        Paragraph('RESUMO CONSOLIDADO', styles['section_center']),
        _make_table(summary_headers, summary_rows or [[Paragraph('Nenhum lote encontrado para o relatório.', styles['table_cell'])] + [''] * (len(summary_headers) - 1)], summary_widths, styles, justify_columns={1 if len(summary_headers) > 1 else 0, len(summary_headers) - 1}),
        Spacer(1, 10),
    ]

    for lot in lots:
        story.extend(_lot_story(lot, styles, include_reason=include_reason))

    doc.build(story, onFirstPage=lambda canvas, document: _page_decorations(canvas, document, branding), onLaterPages=lambda canvas, document: _page_decorations(canvas, document, branding))


def _branding_from_config(config: dict[str, Any] | None, generated_by: str | None) -> BrandingConfig:
    lines = list((config or {}).get('lines') or [
        'MUNICÍPIO DE TEIXEIRA DE FREITAS',
        'PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS',
        'CNPJ: 13.650.403/0001-28',
        'AV MARECHAL CASTELO BRANCO, 145, CENTRO, TEIXEIRA DE FREITAS-BA',
    ])
    while len(lines) < 4:
        lines.append('-')
    return BrandingConfig(
        lines=lines[:4],
        footer_text=str((config or {}).get('footer') or 'SIREL - Sistema Integrado de Relatórios e Licitações').strip(),
        logo_path=str((config or {}).get('logo_path') or '').strip() or None,
        generated_by=(generated_by or 'Usuário SIREL').strip(),
    )


def write_report_pdfs(normalized: NormalizedReportData, output_dir: str | Path, *, branding: dict[str, Any] | None = None, generated_by: str | None = None) -> dict[str, str]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    config = _branding_from_config(branding, generated_by)
    subtitle = f"{Path(normalized.source_path).name} · {normalized.generated_at[:19].replace('T', ' ')}"

    adjudicados_pdf = output_dir / 'Relatorio_Adjudicados.pdf'
    _build_pdf(
        adjudicados_pdf,
        'Relatório de lotes adjudicados / em habilitação',
        subtitle,
        [
            ('Arquivo de origem', _shorten(Path(normalized.source_path).name, 28)),
            ('Lotes no relatório', str(len(normalized.adjudicados))),
            ('Warnings', str(normalized.summary.get('warnings', 0))),
            ('Erros de parsing', str(normalized.summary.get('parsing_errors', 0))),
        ],
        ['Lote', 'Descrição', 'Qtd.', 'Valor Unit.', 'Valor Total', 'Marca', 'Modelo', 'Status', 'Vencedor', 'CNPJ', 'Melhor oferta'],
        _summary_rows_adjudicados(normalized.adjudicados, _styles()),
        [34, 182, 34, 56, 58, 44, 46, 58, 122, 86, 54],
        normalized.adjudicados,
        config,
        include_reason=False,
    )

    malsucedidos_pdf = output_dir / 'Relatorio_MalSucedidos.pdf'
    _build_pdf(
        malsucedidos_pdf,
        'Relatório de lotes malsucedidos',
        subtitle,
        [
            ('Arquivo de origem', _shorten(Path(normalized.source_path).name, 28)),
            ('Lotes no relatório', str(len(normalized.malsucedidos))),
            ('Warnings', str(normalized.summary.get('warnings', 0))),
            ('Erros de parsing', str(normalized.summary.get('parsing_errors', 0))),
        ],
        ['Lote', 'Status', 'Descrição', 'Qtd.', 'Partic.', 'Melhor oferta', 'Motivo resumido'],
        _summary_rows_malsucedidos(normalized.malsucedidos, _styles()),
        [36, 72, 258, 38, 44, 86, 240],
        normalized.malsucedidos,
        config,
        include_reason=True,
    )

    return {
        'adjudicados_pdf': str(adjudicados_pdf),
        'malsucedidos_pdf': str(malsucedidos_pdf),
    }

