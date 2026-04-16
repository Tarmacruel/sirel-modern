"""Ferramentas para processar atas de sessão da BLL no SIREL."""

from .data_normalizer import normalize_report_data
from .models import (
    AtaSessaoParseResult,
    LotItemData,
    LotParticipant,
    LotRecord,
    MovimentoLote,
)
from .sd_parser import SDItem, SDMetadata, SDRecord, map_sd_item_to_lot_item, parse_sd_pdf


def parse_ata_sessao_pdf(*args, **kwargs):
    from .parser import parse_ata_sessao_pdf as _impl

    return _impl(*args, **kwargs)


def write_report_pdfs(*args, **kwargs):
    from .pdf_renderer import write_report_pdfs as _impl

    return _impl(*args, **kwargs)


def write_reports_workbooks(*args, **kwargs):
    from .excel import write_reports_workbooks as _impl

    return _impl(*args, **kwargs)


__all__ = [
    "AtaSessaoParseResult",
    "LotItemData",
    "LotParticipant",
    "LotRecord",
    "MovimentoLote",
    "normalize_report_data",
    "parse_ata_sessao_pdf",
    "write_report_pdfs",
    "write_reports_workbooks",
    "SDItem",
    "SDMetadata",
    "SDRecord",
    "parse_sd_pdf",
    "map_sd_item_to_lot_item",
]
