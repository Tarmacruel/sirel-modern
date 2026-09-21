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
  savedValue: string;
  saving: boolean;
  onSave: () => Promise<void>;
}

export function LicitacaoAuditDrawer({
  visible,
  value,
  onChange,
  savedValue,
  saving,
  onSave,
}: LicitacaoAuditDrawerProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const completed = savedValue.trim().length > 0;

  async function save() {
    setError(null);
    try {
      await onSave();
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Nao foi possivel salvar a justificativa.",
      );
    }
  }

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
        description="A justificativa fica salva no processo e sera reutilizada nas proximas etapas, inclusive em outros acessos."
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        size="md"
        actions={
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={saving || !value.trim()}
              onClick={save}
            >
              {saving ? "Salvando..." : "Salvar justificativa"}
            </Button>
          </div>
        }
      >
        <FormField label="Justificativa obrigatoria">
          <Textarea
            rows={6}
            maxLength={4000}
            disabled={saving}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Explique o motivo das alteracoes extemporaneas."
          />
        </FormField>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[var(--danger-color)]">
            {error}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
