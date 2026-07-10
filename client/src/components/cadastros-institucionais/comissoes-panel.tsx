import { GruposInstitucionaisPanel } from "./grupos-institucionais-panel";

export function ComissoesPanel() {
  return (
    <GruposInstitucionaisPanel
      tipo="COMISSAO_CONTRATACAO"
      title="Comissao"
      emptyLabel="Nenhuma comissao cadastrada."
    />
  );
}
