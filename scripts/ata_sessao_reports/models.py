from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


ADJUDICAVEL_STATUSES = {"ADJUDICADO", "HABILITACAO", "HABILITAÇÃO", "HABILITA"}
MALSUCEDIDO_STATUSES = {"FRACASSADO", "DESERTO", "CANCELADO"}


def is_adjudicavel_status(status: str | None) -> bool:
    return str(status or "").strip().upper() in ADJUDICAVEL_STATUSES


def is_malsucedido_status(status: str | None) -> bool:
    return str(status or "").strip().upper() in MALSUCEDIDO_STATUSES


@dataclass(slots=True)
class LotParticipant:
    section: str
    ranking: int | None
    participante_numero: str | None
    razao_social: str
    documento: str | None
    oferta_inicial: float | None
    oferta_final: float | None
    diferenca_percentual: float | None
    me_epp: bool | None
    raw_line: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class MovimentoLote:
    timestamp: str
    evento: str
    detalhe: str
    raw_text: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class LotItemData:
    item_numero: str | None = None
    unidade: str | None = None
    descricao: str | None = None
    quantidade: float | None = None
    valor_unitario: float | None = None
    valor_total: float | None = None
    valor_unitario_estimado: float | None = None
    marca: str | None = None
    modelo: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class LotRecord:
    numero_lote: int
    status: str
    titulo: str
    item: LotItemData = field(default_factory=LotItemData)
    participantes: list[LotParticipant] = field(default_factory=list)
    movimentos: list[MovimentoLote] = field(default_factory=list)
    vencedor: str | None = None
    cnpj_vencedor: str | None = None
    melhor_lance: float | None = None
    motivo_falha: str | None = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["participantes"] = [item.to_dict() for item in self.participantes]
        data["movimentos"] = [item.to_dict() for item in self.movimentos]
        data["item"] = self.item.to_dict()
        return data


@dataclass(slots=True)
class AtaSessaoParseResult:
    source_path: str
    generated_at: str
    lotes: list[LotRecord] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    parsing_errors: list[dict[str, str]] = field(default_factory=list)

    @property
    def adjudicados(self) -> list[LotRecord]:
        return [lot for lot in self.lotes if is_adjudicavel_status(lot.status)]

    @property
    def malsucedidos(self) -> list[LotRecord]:
        return [lot for lot in self.lotes if is_malsucedido_status(lot.status)]

    def build_summary(self) -> dict[str, Any]:
        return {
            "total_lotes": len(self.lotes),
            "adjudicados": len(self.adjudicados),
            "malsucedidos": len(self.malsucedidos),
            "warnings": len(self.warnings),
            "parsing_errors": len(self.parsing_errors),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_path": self.source_path,
            "generated_at": self.generated_at,
            "summary": self.build_summary(),
            "warnings": self.warnings,
            "parsing_errors": self.parsing_errors,
            "lotes": [lot.to_dict() for lot in self.lotes],
        }


def build_output_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def ensure_directory(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
