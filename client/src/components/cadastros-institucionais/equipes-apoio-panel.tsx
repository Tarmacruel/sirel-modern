import { GruposInstitucionaisPanel } from "./grupos-institucionais-panel";

export function EquipesApoioPanel() {
  return (
    <GruposInstitucionaisPanel
      tipo="EQUIPE_APOIO"
      title="Equipe de Apoio"
      emptyLabel="Nenhuma equipe de apoio cadastrada."
    />
  );
}
