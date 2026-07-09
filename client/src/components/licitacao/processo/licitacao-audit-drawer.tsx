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
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] text-[var(--notice-warning-text)] hover:bg-[var(--notice-warning-bg)] hover:text-[var(--notice-warning-text)]"
      >
        {completed ? (
          <ShieldCheck className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        {completed ? "Auditoria registrada" : "Fora do fluxo"}
      </Button>

      <Modal
        open={open}
        title="Justificativa de auditoria"
        description="Processo fora do fluxo. A justificativa sera reaproveitada nas acoes sensiveis desta pagina."
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
