from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .data_normalizer import (
    NormalizedItem,
    NormalizedLot,
    NormalizedParticipant,
    NormalizedReportData,
    ReportHeaderMetadata,
    SECTION_LABELS,
)

PAGE_SIZE = landscape(A4)
PAGE_WIDTH, PAGE_HEIGHT = PAGE_SIZE
LEFT_MARGIN = 10 * mm
RIGHT_MARGIN = 10 * mm
TOP_MARGIN = 28 * mm
BOTTOM_MARGIN = 16 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN

PRIMARY = colors.HexColor("#2440A7")
INK = colors.HexColor("#1f2937")
MUTED = colors.HexColor("#5b6b83")
BORDER = colors.HexColor("#c6d1df")
HEADER_BG = colors.HexColor("#dbe4f0")
PANEL_BG = colors.HexColor("#f8fafc")
SOFT_BG = colors.HexColor("#eef3f8")
DANGER = colors.HexColor("#dc3545")
WARNING = colors.HexColor("#f0ad00")
NEUTRAL = colors.HexColor("#5b6b83")
WHITE = colors.white


@dataclass(slots=True)
class BrandingConfig:
    lines: list[str]
    footer_text: str
    logo_path: str | None
    generated_by: str


def _warn(logger: logging.Logger | None, message: str) -> None:
    if logger:
        logger.warning(message)


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("AtaTitle", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK, alignment=TA_LEFT, spaceAfter=4),
        "subtitle": ParagraphStyle("AtaSubtitle", parent=base["BodyText"], fontName="Helvetica", fontSize=10.2, leading=12.4, textColor=MUTED, alignment=TA_LEFT, spaceAfter=10),
        "section_center": ParagraphStyle("SectionCenter", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=14, textColor=INK, alignment=TA_CENTER, spaceBefore=8, spaceAfter=8),
        "lot_title": ParagraphStyle("LotTitle", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13.5, leading=16, textColor=INK, alignment=TA_CENTER, spaceBefore=10, spaceAfter=6),
        "body": ParagraphStyle("AtaBody", parent=base["BodyText"], fontName="Helvetica", fontSize=9, leading=11.4, textColor=INK, alignment=TA_LEFT),
        "body_justify": ParagraphStyle("AtaBodyJustify", parent=base["BodyText"], fontName="Helvetica", fontSize=9.1, leading=12, textColor=INK, alignment=TA_JUSTIFY),
        "small": ParagraphStyle("AtaSmall", parent=base["BodyText"], fontName="Helvetica", fontSize=7.8, leading=9.6, textColor=MUTED, alignment=TA_LEFT),
        "table_header": ParagraphStyle("TableHeader", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=7.2, leading=8.4, textColor=INK, alignment=TA_LEFT),
        "table_cell": ParagraphStyle("TableCell", parent=base["BodyText"], fontName="Helvetica", fontSize=7.7, leading=9.3, textColor=INK, alignment=TA_LEFT),
        "table_cell_center": ParagraphStyle("TableCellCenter", parent=base["BodyText"], fontName="Helvetica", fontSize=7.7, leading=9.3, textColor=INK, alignment=TA_CENTER),
        "table_cell_justify": ParagraphStyle("TableCellJustify", parent=base["BodyText"], fontName="Helvetica", fontSize=7.7, leading=9.3, textColor=INK, alignment=TA_JUSTIFY),
        "card_label": ParagraphStyle("CardLabel", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=7.1, leading=8.8, textColor=MUTED, alignment=TA_LEFT),
        "card_value": ParagraphStyle("CardValue", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=10.4, leading=12.2, textColor=INK, alignment=TA_LEFT),
        "meta_label": ParagraphStyle("MetaLabel", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=7.2, leading=8.5, textColor=MUTED, alignment=TA_LEFT),
        "meta_value": ParagraphStyle("MetaValue", parent=base["BodyText"], fontName="Helvetica", fontSize=8.9, leading=10.6, textColor=INK, alignment=TA_LEFT),
        "reason_label": ParagraphStyle("ReasonLabel", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=INK, alignment=TA_LEFT),
    }


def _format_currency(value: float | None) -> str:
    if value is None or value <= 0:
        return "-"
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _format_number(value: float | None, decimals: int = 3) -> str:
    if value is None:
        return "-"
    text = f"{value:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return text.rstrip("0").rstrip(",") if "," in text else text


def _text(value: Any) -> str:
    text = str(value or "").strip()
    return text or "-"


def _shorten(value: str | None, max_length: int) -> str:
    text = " ".join(str(value or "").split())
    if not text:
        return "-"
    return text if len(text) <= max_length else f"{text[: max_length - 1].rstrip()}…"


def _scale_widths(widths: list[float], available_width: float) -> list[float]:
    total = sum(widths)
    if total <= 0:
        return widths
    factor = available_width / total
    return [round(width * factor, 2) for width in widths]


def _cards_table(cards: list[tuple[str, str]], styles: dict[str, ParagraphStyle], columns: int = 4) -> Table:
    cards = cards or [("-", "-")]
    gap = 8
    card_width = (CONTENT_WIDTH - ((columns - 1) * gap)) / columns
    rows: list[list[Any]] = []
    row: list[Any] = []

    for index, (label, value) in enumerate(cards, start=1):
        content = [[Paragraph(label.upper(), styles["card_label"])], [Paragraph(value, styles["card_value"])]]
        card = Table(content, colWidths=[card_width], hAlign="LEFT")
        card.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, BORDER),
            ("BACKGROUND", (0, 0), (-1, -1), WHITE),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        row.append(card)
        if index % columns == 0:
            rows.append(row)
            row = []

    if row:
        while len(row) < columns:
            row.append("")
        rows.append(row)

    table = Table(rows, colWidths=[card_width] * columns, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), gap),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _metadata_table(meta: ReportHeaderMetadata, styles: dict[str, ParagraphStyle]) -> Table:
    rows = [
        [
            Paragraph("EDITAL / PREGÃO", styles["meta_label"]),
            Paragraph("PROCESSO ADMINISTRATIVO", styles["meta_label"]),
            Paragraph("DATA DE GERAÇÃO", styles["meta_label"]),
            Paragraph("ARQUIVO DE ORIGEM", styles["meta_label"]),
        ],
        [
            Paragraph(_text(meta.edital), styles["meta_value"]),
            Paragraph(_text(meta.processo_administrativo), styles["meta_value"]),
            Paragraph(_text(meta.data_geracao), styles["meta_value"]),
            Paragraph(_text(meta.arquivo_origem), styles["meta_value"]),
        ],
    ]
    widths = _scale_widths([210, 180, 120, 240], CONTENT_WIDTH)
    table = Table(rows, colWidths=widths, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT_BG),
        ("GRID", (0, 0), (-1, -1), 0.8, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def _make_table(
    headers: list[str],
    rows: list[list[Any]],
    col_widths: list[float],
    styles: dict[str, ParagraphStyle],
    *,
    justify_columns: set[int] | None = None,
) -> Table:
    justify_columns = justify_columns or set()
    scaled_widths = _scale_widths(col_widths, CONTENT_WIDTH)
    data: list[list[Any]] = [[Paragraph(header, styles["table_header"]) for header in headers]]

    for row in rows:
        rendered_row: list[Any] = []
        for index, value in enumerate(row):
            if isinstance(value, Paragraph):
                rendered_row.append(value)
                continue
            style_key = "table_cell_justify" if index in justify_columns else "table_cell"
            rendered_row.append(Paragraph(_text(value), styles[style_key]))
        data.append(rendered_row)

    table = Table(data, colWidths=scaled_widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK),
        ("GRID", (0, 0), (-1, -1), 0.8, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PANEL_BG]),
    ]))
    return table


def _summary_rows_operacionais(lots: list[NormalizedLot], styles: dict[str, ParagraphStyle]) -> list[list[Any]]:
    rows: list[list[Any]] = []
    for lot in lots:
        rows.append([
            _text(lot.numero_lote),
            Paragraph(_shorten(lot.descricao, 90), styles["table_cell_justify"]),
            f"{lot.total_itens} ite(ns)",
            _format_number(lot.quantidade_total),
            _format_currency(lot.valor_total_lote),
            _shorten(lot.marca, 20),
            _shorten(lot.modelo, 20),
            _shorten(lot.status, 16),
            _shorten(lot.vencedor, 40),
            _shorten(lot.cnpj_vencedor, 24),
            _format_currency(lot.melhor_oferta),
        ])
    return rows


def _summary_rows_malsucedidos(lots: list[NormalizedLot], styles: dict[str, ParagraphStyle]) -> list[list[Any]]:
    rows: list[list[Any]] = []
    for lot in lots:
        rows.append([
            _text(lot.numero_lote),
            _text(lot.status),
            Paragraph(_shorten(lot.descricao, 120), styles["table_cell_justify"]),
            f"{lot.total_itens} ite(ns)",
            _text(lot.participantes_totais),
            _format_currency(lot.melhor_oferta),
            Paragraph(_shorten(lot.motivo_falha, 140), styles["table_cell_justify"]),
        ])
    return rows


def _participant_table_for_section(section: str, participants: list[NormalizedParticipant], styles: dict[str, ParagraphStyle]) -> list[Any]:
    story: list[Any] = [Paragraph(SECTION_LABELS[section].upper(), styles["section_center"])]

    if section == "MOVIMENTOS":
        rows = [[_text(item.participante_numero), item.razao_social, _format_currency(item.oferta_registrada)] for item in participants]
        story.append(_make_table(
            ["Part.", "Razão Social", "Oferta registrada no movimento"],
            rows,
            [54, 494, 170],
            styles,
        ))
        return story

    rows = [
        [
            _text(item.ranking),
            item.razao_social,
            _text(item.documento),
            _format_currency(item.oferta_inicial),
            _format_currency(item.oferta_final),
            "-" if item.diferenca_percentual is None else f"{item.diferenca_percentual:.2f}%".replace(".", ","),
            "Sim" if item.me_epp else "Não" if item.me_epp is False else "-",
        ]
        for item in participants
    ]
    story.append(_make_table(
        ["Class.", "Razão Social", "CNPJ/CPF", "Oferta Inicial", "Oferta Final", "Dif.(%)", "ME/EPP"],
        rows,
        [40, 284, 122, 88, 88, 62, 52],
        styles,
    ))
    return story


def _reason_color(status: str) -> colors.Color:
    normalized = status.strip().upper()
    if normalized == "CANCELADO":
        return WARNING
    if normalized == "DESERTO":
        return NEUTRAL
    return DANGER


def _reason_block(lot: NormalizedLot, styles: dict[str, ParagraphStyle]) -> Table:
    content = [
        [Paragraph("MOTIVO CONSOLIDADO", styles["reason_label"])],
        [Paragraph(_text(lot.motivo_falha), styles["body_justify"])],
    ]
    table = Table(content, colWidths=[CONTENT_WIDTH], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL_BG),
        ("BOX", (0, 0), (-1, -1), 0.8, BORDER),
        ("LINEBEFORE", (0, 0), (0, -1), 4, _reason_color(lot.status)),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def _items_table(items: list[NormalizedItem], styles: dict[str, ParagraphStyle]) -> Table:
    rows: list[list[Any]] = []
    for item in items:
        rows.append([
            _text(item.item_numero),
            Paragraph(_shorten(item.descricao, 80), styles["table_cell_justify"]),
            _format_number(item.quantidade),
            _format_currency(item.valor_unitario),
            _format_currency(item.valor_total),
            _shorten(item.marca, 18),
            _shorten(item.modelo, 18),
        ])

    return _make_table(
        ["Item", "Descrição", "Qtd.", "Valor Unit.", "Valor Total", "Marca", "Modelo"],
        rows,
        [34, 270, 44, 72, 76, 80, 80],
        styles,
        justify_columns={1},
    )


def _lot_story(lot: NormalizedLot, styles: dict[str, ParagraphStyle], include_reason: bool, logger: logging.Logger | None) -> list[Any]:
    cards = [
        ("Qtd. Total", _format_number(lot.quantidade_total)),
        ("Marca", _text(lot.marca) if lot.total_itens <= 1 else ""),
        ("Modelo", _text(lot.modelo) if lot.total_itens <= 1 else ""),
        ("Participantes", _text(lot.participantes_totais)),
        ("Classificados", _text(lot.classificados)),
        ("Desclassificados", _text(lot.desclassificados)),
        ("Inabilitados", _text(lot.inabilitados)),
        ("Melhor oferta", _format_currency(lot.melhor_oferta)),
    ]
    intro: list[Any] = [
        Paragraph(f"LOTE {lot.numero_lote} - {lot.status}", styles["lot_title"]),
        Paragraph(lot.descricao or "-", styles["body_justify"]),
        Spacer(1, 6),
        _cards_table(cards, styles, columns=4),
    ]
    if include_reason:
        if not lot.motivo_falha:
            _warn(logger, f"Lote {lot.numero_lote}: motivo consolidado ausente no relatório malsucedido.")
        intro.extend([_reason_block(lot, styles), Spacer(1, 8)])

    story: list[Any] = [KeepTogether(intro)]

    if lot.itens:
        if len(lot.itens) > 1:
            story.append(Spacer(1, 10))
            story.append(Paragraph("DETALHAMENTO DOS ITENS", styles["section_center"]))
            story.append(_items_table(lot.itens, styles))
            story.append(Spacer(1, 10))
        else:
            item = lot.itens[0]
            story.append(Spacer(1, 10))
            story.append(Paragraph("DETALHAMENTO DO ITEM", styles["section_center"]))
            story.append(_make_table(
                ["Campo", "Valor"],
                [
                    ["Item", _text(item.item_numero)],
                    ["Descrição", item.descricao or lot.descricao],
                    ["Unidade", _text(item.unidade)],
                    ["Quantidade", _format_number(item.quantidade)],
                    ["Valor Unitário", _format_currency(item.valor_unitario)],
                    ["Valor Total", _format_currency(item.valor_total)],
                    ["Marca", _text(item.marca)],
                    ["Modelo", _text(item.modelo)],
                ],
                [150, 530],
                styles,
                justify_columns={1},
            ))
            story.append(Spacer(1, 10))

    sections: dict[str, list[NormalizedParticipant]] = {}
    for participant in lot.participantes_exibidos:
        sections.setdefault(participant.section, []).append(participant)

    for section in ["CLASSIFICACAO", "DESCLASSIFICADOS", "INABILITADOS", "MOVIMENTOS"]:
        participants = sections.get(section) or []
        if not participants:
            continue
        story.extend(_participant_table_for_section(section, participants, styles))
        story.append(Spacer(1, 8))

    story.append(HRFlowable(color=BORDER, thickness=0.8, width="100%", spaceBefore=0, spaceAfter=12))
    return story


def _page_decorations(canvas, _doc, branding: BrandingConfig):
    canvas.saveState()
    if branding.logo_path and Path(branding.logo_path).exists():
        canvas.drawImage(branding.logo_path, LEFT_MARGIN, PAGE_HEIGHT - 20 * mm, width=38 * mm, height=14 * mm, preserveAspectRatio=True, mask="auto")
    text_x = LEFT_MARGIN + 44 * mm
    header_y = PAGE_HEIGHT - 9 * mm
    canvas.setFillColor(PRIMARY)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(text_x, header_y, branding.lines[0])
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 8.7)
    canvas.drawString(text_x, header_y - 10, branding.lines[1])
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.8)
    canvas.drawString(text_x, header_y - 19, branding.lines[2])
    canvas.drawString(text_x, header_y - 28, branding.lines[3])
    footer_y = 9 * mm
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.8)
    canvas.line(LEFT_MARGIN, footer_y + 8, PAGE_WIDTH - RIGHT_MARGIN, footer_y + 8)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.2)
    canvas.drawString(LEFT_MARGIN, footer_y - 1, f"Gerado por: {branding.generated_by}")
    canvas.drawCentredString(PAGE_WIDTH / 2, footer_y - 1, f"{branding.footer_text} | Desenvolvido por Jonatas da Silva Sousa")
    canvas.drawRightString(PAGE_WIDTH - RIGHT_MARGIN, footer_y - 1, f"Página {canvas.getPageNumber()}")
    canvas.restoreState()


def _build_pdf(
    path: Path,
    report_title: str,
    subtitle: str,
    report_cards: list[tuple[str, str]],
    summary_headers: list[str],
    summary_rows: list[list[Any]],
    summary_widths: list[float],
    lots: list[NormalizedLot],
    meta: ReportHeaderMetadata,
    branding: BrandingConfig,
    *,
    include_reason: bool,
    logger: logging.Logger | None,
) -> None:
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
    empty_row = [Paragraph("Nenhum lote encontrado para o relatório.", styles["table_cell"])]
    while len(empty_row) < len(summary_headers):
        empty_row.append("")

    story: list[Any] = [
        Paragraph(report_title, styles["title"]),
        Paragraph(subtitle, styles["subtitle"]),
        _metadata_table(meta, styles),
        Spacer(1, 8),
        _cards_table(report_cards, styles, columns=4),
        Spacer(1, 2),
        Paragraph("RESUMO CONSOLIDADO", styles["section_center"]),
        _make_table(
            summary_headers,
            summary_rows or [empty_row],
            summary_widths,
            styles,
            justify_columns={1 if len(summary_headers) > 1 else 0, len(summary_headers) - 1},
        ),
        Spacer(1, 10),
    ]

    for lot in lots:
        story.extend(_lot_story(lot, styles, include_reason, logger))

    doc.build(
        story,
        onFirstPage=lambda canvas, document: _page_decorations(canvas, document, branding),
        onLaterPages=lambda canvas, document: _page_decorations(canvas, document, branding),
    )


def _branding_from_config(config: dict[str, Any] | None, generated_by: str | None) -> BrandingConfig:
    lines = list((config or {}).get("lines") or [
        "MUNICÍPIO DE TEIXEIRA DE FREITAS",
        "Secretaria Municipal de Administração",
        "CNPJ: 13.650.403/0001-28",
        "AV MARECHAL CASTELO BRANCO, 145, CENTRO, TEIXEIRA DE FREITAS-BA",
    ])
    while len(lines) < 4:
        lines.append("-")
    return BrandingConfig(
        lines=lines[:4],
        footer_text=str((config or {}).get("footer") or "SIREL - Sistema Integrado de Relatórios e Licitações").strip(),
        logo_path=str((config or {}).get("logo_path") or "").strip() or None,
        generated_by=(generated_by or "Usuário SIREL").strip(),
    )


def write_report_pdfs(
    normalized: NormalizedReportData,
    output_dir: str | Path,
    *,
    branding: dict[str, Any] | None = None,
    generated_by: str | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, str]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    config = _branding_from_config(branding, generated_by)
    subtitle = f"{normalized.header.arquivo_origem} · {normalized.header.data_geracao[:19].replace('T', ' ')}"

    em_andamento_pdf = output_dir / "Relatorio_EmAndamento.pdf"
    _build_pdf(
        em_andamento_pdf,
        "Relatório de lotes em andamento",
        subtitle,
        [
            ("Lotes no relatório", str(len(normalized.em_andamento))),
            ("Warnings de parsing", str(normalized.summary.get("warnings", 0))),
            ("Erros de parsing", str(normalized.summary.get("parsing_errors", 0))),
            ("Gerado em", normalized.header.data_geracao.replace("T", " ")[:19]),
        ],
        ["Lote", "Descrição", "Itens", "Qtd. Total", "Valor Total", "Marca", "Modelo", "Status", "Vencedor", "CNPJ", "Melhor oferta"],
        _summary_rows_operacionais(normalized.em_andamento, _styles()),
        [28, 152, 30, 52, 54, 42, 42, 52, 114, 80, 52],
        normalized.em_andamento,
        normalized.header,
        config,
        include_reason=False,
        logger=logger,
    )

    adjudicados_pdf = output_dir / "Relatorio_Adjudicados.pdf"
    _build_pdf(
        adjudicados_pdf,
        "Relatório de lotes adjudicados",
        subtitle,
        [
            ("Lotes no relatório", str(len(normalized.adjudicados))),
            ("Warnings de parsing", str(normalized.summary.get("warnings", 0))),
            ("Erros de parsing", str(normalized.summary.get("parsing_errors", 0))),
            ("Gerado em", normalized.header.data_geracao.replace("T", " ")[:19]),
        ],
        ["Lote", "Descrição", "Itens", "Qtd. Total", "Valor Total", "Marca", "Modelo", "Status", "Vencedor", "CNPJ", "Melhor oferta"],
        _summary_rows_operacionais(normalized.adjudicados, _styles()),
        [28, 152, 30, 52, 54, 42, 42, 52, 114, 80, 52],
        normalized.adjudicados,
        normalized.header,
        config,
        include_reason=False,
        logger=logger,
    )

    fase_recursal_pdf = output_dir / "Relatorio_FaseRecursal.pdf"
    _build_pdf(
        fase_recursal_pdf,
        "Relatório de lotes em fase recursal",
        subtitle,
        [
            ("Lotes no relatório", str(len(normalized.fase_recursal))),
            ("Warnings de parsing", str(normalized.summary.get("warnings", 0))),
            ("Erros de parsing", str(normalized.summary.get("parsing_errors", 0))),
            ("Gerado em", normalized.header.data_geracao.replace("T", " ")[:19]),
        ],
        ["Lote", "Descrição", "Itens", "Qtd. Total", "Valor Total", "Marca", "Modelo", "Status", "Vencedor", "CNPJ", "Melhor oferta"],
        _summary_rows_operacionais(normalized.fase_recursal, _styles()),
        [28, 152, 30, 52, 54, 42, 42, 52, 114, 80, 52],
        normalized.fase_recursal,
        normalized.header,
        config,
        include_reason=False,
        logger=logger,
    )

    malsucedidos_pdf = output_dir / "Relatorio_MalSucedidos.pdf"
    _build_pdf(
        malsucedidos_pdf,
        "Relatório de lotes malsucedidos",
        subtitle,
        [
            ("Lotes no relatório", str(len(normalized.malsucedidos))),
            ("Warnings de parsing", str(normalized.summary.get("warnings", 0))),
            ("Erros de parsing", str(normalized.summary.get("parsing_errors", 0))),
            ("Gerado em", normalized.header.data_geracao.replace("T", " ")[:19]),
        ],
        ["Lote", "Status", "Descrição", "Itens", "Partic.", "Melhor oferta", "Motivo resumido"],
        _summary_rows_malsucedidos(normalized.malsucedidos, _styles()),
        [34, 68, 236, 36, 42, 82, 220],
        normalized.malsucedidos,
        normalized.header,
        config,
        include_reason=True,
        logger=logger,
    )

    return {
        "em_andamento_pdf": str(em_andamento_pdf),
        "adjudicados_pdf": str(adjudicados_pdf),
        "fase_recursal_pdf": str(fase_recursal_pdf),
        "malsucedidos_pdf": str(malsucedidos_pdf),
    }
