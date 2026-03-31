import { useEffect, useState } from "react";

import { Modal } from "@/components/shared/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";

interface MacroTransitionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  targetLabel: string;
  blockers: Array<{ label: string; detalhe?: string }>;
  loading?: boolean;
  onConfirm: (payload: { permitirBypass: boolean; justificativaAuditoria?: string; observacao?: string }) => void | Promise<void>;
}

export function MacroTransitionModal({ open, onClose, title, targetLabel, blockers, loading = false, onConfirm }: MacroTransitionModalProps) {
  const [justificativaAuditoria, setJustificativaAuditoria] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setJustificativaAuditoria("");
    setObservacao("");
  }, [open]);

  const hasBlockers = blockers.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      description={hasBlockers ? `Ha ${blockers.length} pendencia(s) antes do avanco para ${targetLabel}. Voce pode liberar com bypass auditado.` : `O processo esta pronto para seguir para ${targetLabel}.`}
      actions={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            onClick={() =>
              void onConfirm({
                permitirBypass: hasBlockers,
                justificativaAuditoria: justificativaAuditoria || undefined,
                observacao: observacao || undefined,
              })
            }
            loading={loading}
            disabled={hasBlockers && !justificativaAuditoria.trim()}
          >
            {hasBlockers ? "Liberar com pendencias" : `Encaminhar para ${targetLabel}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {hasBlockers ? (
          <Alert variant="warning" title="Pendencias bloqueantes">
            Revise os itens abaixo. Se a operacao precisar seguir mesmo assim, a justificativa ficara registrada na trilha de auditoria.
          </Alert>
        ) : (
          <Alert variant="success">Nenhuma pendencia bloqueante encontrada para a transicao.</Alert>
        )}

        {hasBlockers ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {blockers.map((item) => (
              <li key={item.label} className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
                <div className="font-bold">{item.label}</div>
                {item.detalhe ? <div className="mt-1 text-xs leading-5 text-amber-800">{item.detalhe}</div> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <FormField label={hasBlockers ? "Justificativa de auditoria (obrigatoria)" : "Observacao da transicao (opcional)"}>
          <Textarea
            rows={4}
            value={hasBlockers ? justificativaAuditoria : observacao}
            onChange={(event) => (hasBlockers ? setJustificativaAuditoria(event.target.value) : setObservacao(event.target.value))}
            placeholder={hasBlockers ? "Explique por que a transicao precisa seguir mesmo com pendencias." : "Descreva o contexto da passagem para o proximo modulo, se necessario."}
          />
        </FormField>

        {hasBlockers ? (
          <FormField label="Observacao complementar (opcional)">
            <Textarea
              rows={3}
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              placeholder="Contexto adicional para a equipe do proximo modulo."
            />
          </FormField>
        ) : null}
      </div>
    </Modal>
  );
}
