from __future__ import annotations

import logging
from typing import Any

from .models import AtaSessaoParseResult, LotItemData, LotRecord, is_malsucedido_status


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _warn(logger: logging.Logger | None, result: AtaSessaoParseResult, message: str) -> None:
    if message not in result.warnings:
        result.warnings.append(message)
    if logger:
        logger.warning(message)


def _entry_lot_number(entry: dict[str, Any]) -> int | None:
    try:
        value = int(entry.get("numero_lote") or entry.get("lot_number") or 0)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _find_item(lot: LotRecord, entry: dict[str, Any]) -> LotItemData:
    item_number = _text(entry.get("item_numero") or entry.get("numero_item"))
    if item_number:
        for item in lot.itens:
            if _text(item.item_numero) == item_number:
                return item
    if lot.itens:
        return lot.itens[0]

    item = LotItemData(
        item_numero=item_number or "1",
        descricao=_text(entry.get("descricao_item")) or lot.titulo,
    )
    lot.itens.append(item)
    return item


def apply_estimated_value_enrichment(
    result: AtaSessaoParseResult,
    enrichment: dict[str, Any] | None,
    logger: logging.Logger | None = None,
) -> dict[str, Any] | None:
    if not enrichment:
        return None

    warnings = enrichment.get("warnings")
    if isinstance(warnings, list):
        for warning in warnings:
            message = _text(warning)
            if message:
                _warn(logger, result, message)

    raw_entries = enrichment.get("lotes")
    entries = [entry for entry in raw_entries if isinstance(entry, dict)] if isinstance(raw_entries, list) else []
    by_lot = {
        lot_number: entry
        for entry in entries
        if (lot_number := _entry_lot_number(entry)) is not None
    }

    applied = 0
    for lot in result.lotes:
        if not is_malsucedido_status(lot.status):
            continue
        entry = by_lot.get(lot.numero_lote)
        if not entry:
            continue

        item = _find_item(lot, entry)
        unit_value = _number(entry.get("valor_unitario_estimado"))
        total_value = _number(entry.get("valor_total_estimado"))
        quantity = _number(item.quantidade)

        if unit_value is None and total_value is not None and quantity:
            unit_value = total_value / quantity
        if total_value is None and unit_value is not None and quantity:
            total_value = unit_value * quantity

        if unit_value is None and total_value is None:
            continue

        if unit_value is not None:
            item.valor_unitario_estimado = unit_value
        if total_value is not None:
            item.valor_total_estimado = total_value
        item.valor_estimado_fonte = _text(entry.get("fonte_label")) or _text(entry.get("fonte")) or "Dossiê"
        item.valor_estimado_confianca = _text(entry.get("confianca")) or "SUGERIDA"
        applied += 1

        if item.valor_estimado_confianca.upper() != "ALTA":
            _warn(
                logger,
                result,
                f"Lote {lot.numero_lote}: valor estimado preenchido por melhor candidato interno ({item.valor_estimado_confianca}).",
            )

    metadata = dict(enrichment)
    metadata["lotes_enriquecidos"] = applied
    return metadata
