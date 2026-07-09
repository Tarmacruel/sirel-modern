import { useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";

interface LicitacaoAuditDrawerProps {
  visible: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function LicitacaoAuditDrawer({
  visible,
  value,
  onChange,
}: LicitacaoAuditDrawerProps) {
  const [open, setOpen] = useState(false);

  if (!visible) return null;

  const completed = value.trim().length > 0;

  return (
    <>
      <section className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
              {completed ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                Auditoria reforcada
              </div>
              <p className="mt-1 text-sm leading-6 text-amber-950">
                Processo fora do fluxo. A justificativa sera reaproveitada nas
                acoes sensiveis desta pagina.
              </p>
            </div>
          </div>

          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            {completed ? "Editar justificativa" : "Informar justificativa"}
          </Button>
        </div>
      </section>

      <Modal
        open={open}
        title="Justificativa de auditoria"
        description="Explique o motivo das alteracoes extemporaneas antes de executar acoes sensiveis."
        onClose={() => setOpen(false)}
        size="md"
        actions={
          <div className="flex justify-end">
            <Button type="button" onClick={() => setOpen(false)}>
              Concluir
            </Button>
          </div>
        }
      >
        <FormField label="Justificativa obrigatoria">
          <Textarea
            rows={6}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Explique o motivo das alteracoes extemporaneas."
          />
        </FormField>
      </Modal>
    </>
  );
}
