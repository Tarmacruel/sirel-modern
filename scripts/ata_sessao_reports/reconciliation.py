from __future__ import annotations

import logging
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Iterable

from .models import AtaSessaoParseResult, LotItemData, LotRecord, is_malsucedido_status
from .sd_parser import SDItem, SDRecord

DESCRIPTION_THRESHOLD = 0.85
DESCRIPTION_MARGIN = 0.15
ORDINAL_DESCRIPTION_THRESHOLD = 0.70

MATCHED = "CONCILIADO"
AMBIGUOUS = "AMBIGUO"
UNMATCHED = "NAO_ENCONTRADO"


@dataclass(slots=True)
class _Target:
    lot: LotRecord
    item: LotItemData
    item_index: int
    global_ordinal: int
    previous_unit: float | None
    previous_total: float | None
    previous_source: str | None
    status: str = "PENDENTE"
    sd_index: int | None = None

    @property
    def label(self) -> str:
        item_label = self.item.item_numero or str(self.item_index + 1)
        return f"Lote {self.lot.numero_lote}, item {item_label}"

    @property
    def description(self) -> str:
        return self.item.descricao or self.lot.titulo


@dataclass(slots=True)
class _Proposal:
    target: _Target
    sd_index: int
    method: str
    confidence: str


def _normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or "").casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def _normalize_catalog(value: object) -> str | None:
    normalized = re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())
    if not normalized:
        return None
    if normalized.isdigit():
        return normalized.lstrip("0") or "0"
    return normalized


def _normalize_unit(value: object) -> str | None:
    normalized = re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())
    if not normalized:
        return None
    aliases = {
        "UND": "UN",
        "UNID": "UN",
        "UNIDADE": "UN",
        "UNIDADES": "UN",
        "PC": "PCA",
        "PCA": "PCA",
        "PECA": "PCA",
        "PECAS": "PCA",
        "MT": "M",
        "METRO": "M",
        "METROS": "M",
        "PCT": "PCT",
        "PACOTE": "PCT",
    }
    return aliases.get(normalized, normalized)


def _description_similarity(left: object, right: object) -> float:
    normalized_left = _normalize_text(left)
    normalized_right = _normalize_text(right)
    if not normalized_left or not normalized_right:
        return 0.0
    direct_score = SequenceMatcher(None, normalized_left, normalized_right).ratio()
    left_without_catalog = re.sub(r"^\d{5,12}\s+", "", normalized_left)
    right_without_catalog = re.sub(r"^\d{5,12}\s+", "", normalized_right)
    without_catalog_score = SequenceMatcher(
        None,
        left_without_catalog,
        right_without_catalog,
    ).ratio()
    return max(direct_score, without_catalog_score)


def _quantities_match(left: object, right: object) -> bool | None:
    try:
        left_number = float(left)  # type: ignore[arg-type]
        right_number = float(right)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    tolerance = max(0.0001, max(abs(left_number), abs(right_number)) * 0.0001)
    return abs(left_number - right_number) <= tolerance


def _units_match(left: object, right: object) -> bool | None:
    normalized_left = _normalize_unit(left)
    normalized_right = _normalize_unit(right)
    if not normalized_left or not normalized_right:
        return None
    return normalized_left == normalized_right


def _semantic_signals(target: _Target, sd_item: SDItem) -> dict[str, object]:
    target_catalog = _normalize_catalog(target.item.catmat_catser)
    sd_catalog = _normalize_catalog(sd_item.catmat_catser)
    catalog_match = (
        target_catalog == sd_catalog
        if target_catalog is not None and sd_catalog is not None
        else None
    )
    return {
        "catalog": catalog_match,
        "description": _description_similarity(target.description, sd_item.descricao),
        "quantity": _quantities_match(target.item.quantidade, sd_item.quantidade),
        "unit": _units_match(target.item.unidade, sd_item.unidade),
    }


def _has_divergent_signals(signals: dict[str, object], *, catalog_is_primary: bool = False) -> bool:
    catalog = signals["catalog"]
    description = float(signals["description"])
    quantity = signals["quantity"]
    unit = signals["unit"]
    if catalog is False:
        return True
    if catalog_is_primary and catalog is True:
        return quantity is False and unit is False and description < 0.45
    # Numeração coincidente não neutraliza uma descrição claramente alheia.
    # Quantidade e unidade são sinais fracos e frequentemente se repetem em
    # itens distintos (por exemplo, vários itens com 1 UN).
    if description < 0.35:
        return True
    if quantity is False and unit is False:
        return True
    return False


def _has_ordinal_confirmation(signals: dict[str, object]) -> bool:
    description = float(signals["description"])
    return bool(
        signals["catalog"] is True
        or description >= ORDINAL_DESCRIPTION_THRESHOLD
        or (
            description >= 0.35
            and signals["quantity"] is True
            and signals["unit"] is True
        )
    )


def _has_description_confirmation(signals: dict[str, object]) -> bool:
    quantity = signals["quantity"]
    unit = signals["unit"]
    if quantity is False or unit is False:
        return False
    return quantity is True or unit is True


def _append_warning(
    result: AtaSessaoParseResult,
    warnings: list[str],
    message: str,
    logger: logging.Logger | None,
) -> None:
    if message not in warnings:
        warnings.append(message)
    if message not in result.warnings:
        result.warnings.append(message)
    if logger:
        logger.warning(message)


def _mark_ambiguous(
    target: _Target,
    result: AtaSessaoParseResult,
    warnings: list[str],
    reason: str,
    logger: logging.Logger | None,
) -> None:
    target.status = AMBIGUOUS
    target.item.valor_estimado_conciliacao = AMBIGUOUS
    target.item.valor_estimado_correspondencia = None
    _append_warning(result, warnings, f"{target.label}: conciliação ambígua ({reason}).", logger)


def _apply_match(
    proposal: _Proposal,
    sd: SDRecord,
    result: AtaSessaoParseResult,
    warnings: list[str],
    logger: logging.Logger | None,
) -> None:
    target = proposal.target
    sd_item = sd.itens[proposal.sd_index]
    new_unit = float(sd_item.preco_unitario)
    new_total = float(sd_item.preco_total)
    previous_differences: list[str] = []
    if target.previous_unit is not None and abs(target.previous_unit - new_unit) > 0.01:
        previous_differences.append(
            f"unitário anterior R$ {target.previous_unit:.2f} / SD R$ {new_unit:.2f}"
        )
    if target.previous_total is not None and abs(target.previous_total - new_total) > 0.01:
        previous_differences.append(
            f"total anterior R$ {target.previous_total:.2f} / SD R$ {new_total:.2f}"
        )
    if previous_differences:
        previous_source = target.previous_source or "fonte interna/Ata"
        _append_warning(
            result,
            warnings,
            f"{target.label}: divergência de valor estimado em relação a {previous_source} "
            f"({'; '.join(previous_differences)}); a SD prevaleceu.",
            logger,
        )

    target.status = MATCHED
    target.sd_index = proposal.sd_index
    target.item.valor_unitario_estimado = new_unit
    target.item.valor_total_estimado = new_total
    target.item.valor_estimado_fonte = (
        f"Solicitação de Despesa — SD {sd.metadata.numero_sd}"
    )
    target.item.valor_estimado_confianca = proposal.confidence
    target.item.valor_estimado_processo_fonte = (
        sd.metadata.processo_administrativo or f"SD {sd.metadata.numero_sd}"
    )
    target.item.valor_estimado_conciliacao = MATCHED
    target.item.valor_estimado_correspondencia = proposal.method


def _resolve_proposals(
    proposals: Iterable[_Proposal],
    used_sd_items: set[int],
    sd: SDRecord,
    result: AtaSessaoParseResult,
    warnings: list[str],
    logger: logging.Logger | None,
) -> None:
    grouped: dict[int, list[_Proposal]] = defaultdict(list)
    for proposal in proposals:
        grouped[proposal.sd_index].append(proposal)

    for sd_index, candidates in grouped.items():
        if sd_index in used_sd_items or len(candidates) > 1:
            reason = (
                f"o item {sd.itens[sd_index].numero} da SD já foi utilizado"
                if sd_index in used_sd_items
                else f"mais de um item da Ata aponta para o item {sd.itens[sd_index].numero} da SD"
            )
            for proposal in candidates:
                _mark_ambiguous(proposal.target, result, warnings, reason, logger)
            continue
        proposal = candidates[0]
        _apply_match(proposal, sd, result, warnings, logger)
        used_sd_items.add(sd_index)


def _build_targets(result: AtaSessaoParseResult) -> tuple[list[_Target], list[LotRecord]]:
    targets: list[_Target] = []
    failed_without_items: list[LotRecord] = []
    global_ordinal = 0
    for lot in result.lotes:
        for item_index, item in enumerate(lot.itens):
            global_ordinal += 1
            if not is_malsucedido_status(lot.status):
                continue
            targets.append(
                _Target(
                    lot=lot,
                    item=item,
                    item_index=item_index,
                    global_ordinal=global_ordinal,
                    previous_unit=item.valor_unitario_estimado,
                    previous_total=item.valor_total_estimado,
                    previous_source=item.valor_estimado_fonte,
                )
            )
        if is_malsucedido_status(lot.status) and not lot.itens:
            failed_without_items.append(lot)
    return targets, failed_without_items


def _clear_failed_estimates(targets: Iterable[_Target]) -> None:
    for target in targets:
        target.item.valor_unitario_estimado = None
        target.item.valor_total_estimado = None
        target.item.valor_estimado_fonte = None
        target.item.valor_estimado_confianca = None
        target.item.valor_estimado_processo_fonte = None
        target.item.valor_estimado_conciliacao = "PENDENTE"
        target.item.valor_estimado_correspondencia = None


def reconcile_estimated_values(
    result: AtaSessaoParseResult,
    sd: SDRecord,
    *,
    logger: logging.Logger | None = None,
) -> dict[str, object]:
    """Concilia, sem reutilização, valores estimados da SD com lotes malsucedidos."""
    targets, failed_without_items = _build_targets(result)
    _clear_failed_estimates(targets)
    warnings: list[str] = []
    used_sd_items: set[int] = set()

    for warning in sd.warnings:
        _append_warning(
            result,
            warnings,
            f"SD {sd.metadata.numero_sd}: {warning}",
            logger,
        )

    catalog_indexes: dict[str, list[int]] = defaultdict(list)
    ordinal_indexes: dict[int, list[int]] = defaultdict(list)
    for sd_index, sd_item in enumerate(sd.itens):
        if catalog := _normalize_catalog(sd_item.catmat_catser):
            catalog_indexes[catalog].append(sd_index)
        ordinal_indexes[sd_item.numero].append(sd_index)

    catalog_proposals: list[_Proposal] = []
    for target in targets:
        catalog = _normalize_catalog(target.item.catmat_catser)
        if not catalog:
            continue
        candidates = catalog_indexes.get(catalog, [])
        if len(candidates) > 1:
            _mark_ambiguous(
                target,
                result,
                warnings,
                f"CATMAT/CATSER {target.item.catmat_catser} duplicado na SD",
                logger,
            )
            continue
        if len(candidates) != 1:
            continue
        sd_index = candidates[0]
        signals = _semantic_signals(target, sd.itens[sd_index])
        if _has_divergent_signals(signals, catalog_is_primary=True):
            _mark_ambiguous(
                target,
                result,
                warnings,
                f"CATMAT/CATSER exato, mas sinais semânticos divergentes no item {sd.itens[sd_index].numero} da SD",
                logger,
            )
            continue
        catalog_proposals.append(_Proposal(target, sd_index, "CATMAT_CATSER", "ALTA"))
    _resolve_proposals(catalog_proposals, used_sd_items, sd, result, warnings, logger)

    ordinal_proposals: list[_Proposal] = []
    lots_with_items = [lot for lot in result.lotes if lot.itens]
    use_lot_ordinal = bool(lots_with_items) and all(
        len(lot.itens) == 1 for lot in lots_with_items
    )

    for target in targets:
        if target.status != "PENDENTE":
            continue
        is_single_item_lot = len(target.lot.itens) == 1
        ordinal = (
            target.lot.numero_lote
            if is_single_item_lot and use_lot_ordinal
            else target.global_ordinal
        )
        candidates = ordinal_indexes.get(ordinal, [])
        if len(candidates) > 1:
            _mark_ambiguous(
                target,
                result,
                warnings,
                f"numeração {ordinal} duplicada na SD",
                logger,
            )
            continue
        if len(candidates) != 1:
            continue
        sd_index = candidates[0]
        signals = _semantic_signals(target, sd.itens[sd_index])
        if _has_divergent_signals(signals):
            _mark_ambiguous(
                target,
                result,
                warnings,
                f"numeração {ordinal} aponta para sinais divergentes na SD",
                logger,
            )
            continue
        if not _has_ordinal_confirmation(signals):
            continue
        ordinal_proposals.append(
            _Proposal(
                target,
                sd_index,
                "LOTE" if is_single_item_lot and use_lot_ordinal else "ITEM_GLOBAL",
                "ALTA",
            )
        )
    _resolve_proposals(ordinal_proposals, used_sd_items, sd, result, warnings, logger)

    description_proposals: list[_Proposal] = []
    for target in targets:
        if target.status != "PENDENTE":
            continue
        scored = sorted(
            (
                (_description_similarity(target.description, sd_item.descricao), sd_index)
                for sd_index, sd_item in enumerate(sd.itens)
            ),
            reverse=True,
        )
        if not scored or scored[0][0] < DESCRIPTION_THRESHOLD:
            continue

        best_score, best_index = scored[0]
        if best_index in used_sd_items:
            _mark_ambiguous(
                target,
                result,
                warnings,
                f"a melhor descrição corresponde ao item {sd.itens[best_index].numero} da SD já utilizado",
                logger,
            )
            continue

        best_description = _normalize_text(sd.itens[best_index].descricao)
        duplicate_description_count = sum(
            1 for sd_item in sd.itens if _normalize_text(sd_item.descricao) == best_description
        )
        second_score = scored[1][0] if len(scored) > 1 else 0.0
        if duplicate_description_count > 1 or best_score - second_score < DESCRIPTION_MARGIN:
            _mark_ambiguous(
                target,
                result,
                warnings,
                "descrição sem correspondência única ou sem margem de 0,15 sobre o segundo candidato",
                logger,
            )
            continue

        signals = _semantic_signals(target, sd.itens[best_index])
        if _has_divergent_signals(signals) or not _has_description_confirmation(signals):
            _mark_ambiguous(
                target,
                result,
                warnings,
                "descrição semelhante sem confirmação coerente de quantidade/unidade",
                logger,
            )
            continue
        description_proposals.append(_Proposal(target, best_index, "DESCRICAO", "MÉDIA"))
    _resolve_proposals(description_proposals, used_sd_items, sd, result, warnings, logger)

    for target in targets:
        if target.status != "PENDENTE":
            continue
        target.status = UNMATCHED
        target.item.valor_estimado_conciliacao = UNMATCHED
        _append_warning(
            result,
            warnings,
            f"{target.label}: nenhum item seguro foi encontrado na SD; valor estimado mantido em branco.",
            logger,
        )

    for lot in failed_without_items:
        _append_warning(
            result,
            warnings,
            f"Lote {lot.numero_lote}: nenhum item foi extraído da Ata para conciliar com a SD.",
            logger,
        )

    failed_lots = [lot for lot in result.lotes if is_malsucedido_status(lot.status)]
    by_lot: dict[int, list[_Target]] = defaultdict(list)
    for target in targets:
        by_lot[target.lot.numero_lote].append(target)

    fully_matched_lots = 0
    partially_matched_lots = 0
    unmatched_lot_numbers: set[int] = {lot.numero_lote for lot in failed_without_items}
    ambiguous_lot_numbers: set[int] = set()
    for lot in failed_lots:
        lot_targets = by_lot.get(lot.numero_lote, [])
        matched_count = sum(target.status == MATCHED for target in lot_targets)
        if lot_targets and matched_count == len(lot_targets):
            fully_matched_lots += 1
        elif matched_count > 0:
            partially_matched_lots += 1
        if any(target.status == UNMATCHED for target in lot_targets):
            unmatched_lot_numbers.add(lot.numero_lote)
        if any(target.status == AMBIGUOUS for target in lot_targets):
            ambiguous_lot_numbers.add(lot.numero_lote)

    metadata: dict[str, object] = {
        "source": "SD",
        "sd_number": sd.metadata.numero_sd,
        "total_failed_lots": len(failed_lots),
        "fully_matched_lots": fully_matched_lots,
        "partially_matched_lots": partially_matched_lots,
        "unmatched_lots": sorted(unmatched_lot_numbers),
        "ambiguous_lots": sorted(ambiguous_lot_numbers),
        "total_failed_items": len(targets),
        "matched_items": sum(target.status == MATCHED for target in targets),
        "ambiguous_items": sum(target.status == AMBIGUOUS for target in targets),
        "unmatched_items": sum(target.status == UNMATCHED for target in targets),
        "warnings": warnings,
    }
    result.estimated_value_reconciliation = metadata
    return metadata
