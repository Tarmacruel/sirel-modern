import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

type AuditoriaUserOption = {
  id: number;
  nome: string;
};

type AuditoriaItem = {
  id: number;
  criadoEm: string | Date;
  usuarioNome?: string | null;
  acao: string;
  tabela: string;
  descricao?: string | null;
  dadosAnteriores: unknown;
  dadosNovos: unknown;
};

interface AuditoriaPagination {
  items: AuditoriaItem[];
  page: number;
  totalPages: number;
  totalItems: number;
}

interface LicitacaoProcessoAuditoriaContentProps {
  actionFilter: string;
  userFilter: string;
  onActionFilterChange: (value: string) => void;
  onUserFilterChange: (value: string) => void;
  userOptions: AuditoriaUserOption[];
  isLoading: boolean;
  items: AuditoriaItem[];
  pagination: AuditoriaPagination;
  onPageChange: (page: number) => void;
  stickyColumnHeaderClass: string;
  stickyColumnCellClass: string;
  formatShortDateTimeBR: (value: string | Date) => string;
  formatAuditValue: (value: unknown) => string;
  cleanDisplayText: (value: string | null | undefined) => string;
}

export default function LicitacaoProcessoAuditoriaContent({
  actionFilter,
  userFilter,
  onActionFilterChange,
  onUserFilterChange,
  userOptions,
  isLoading,
  items,
  pagination,
  onPageChange,
  stickyColumnHeaderClass,
  stickyColumnCellClass,
  formatShortDateTimeBR,
  formatAuditValue,
  cleanDisplayText,
}: LicitacaoProcessoAuditoriaContentProps) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <FormField label="Acao">
          <Select
            value={actionFilter}
            onChange={(event) => onActionFilterChange(event.target.value)}
          >
            <option value="">Todas</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </Select>
        </FormField>
        <FormField label="Usuario">
          <Select
            value={userFilter}
            onChange={(event) => onUserFilterChange(event.target.value)}
          >
            <option value="">Todos</option>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nome}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {isLoading ? (
        <div className="mt-4 grid gap-3">
          {[0, 1].map((item) => (
            <Skeleton key={item} className="h-24 rounded-[28px]" />
          ))}
        </div>
      ) : items.length ? (
        <>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-[var(--text-secondary)]">
              {pagination.totalItems} registro(s) de auditoria.
            </div>
            {pagination.totalPages > 1 ? (
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={onPageChange}
              />
            ) : null}
          </div>
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
            <Table className="min-w-[1080px]">
              <TableHead>
                <tr>
                  <TableHeaderCell className={stickyColumnHeaderClass}>
                    Data
                  </TableHeaderCell>
                  <TableHeaderCell>Usuario</TableHeaderCell>
                  <TableHeaderCell>Acao</TableHeaderCell>
                  <TableHeaderCell>Tabela</TableHeaderCell>
                  <TableHeaderCell>Campo</TableHeaderCell>
                  <TableHeaderCell>Valor anterior</TableHeaderCell>
                  <TableHeaderCell>Valor novo</TableHeaderCell>
                  <TableHeaderCell>Descricao</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {pagination.items.map((item) => {
                  const campo =
                    (item.dadosNovos as { campo?: string } | null)?.campo ??
                    (item.dadosAnteriores as { campo?: string } | null)
                      ?.campo ??
                    "-";
                  const valorAnterior =
                    (item.dadosAnteriores as { valor?: unknown } | null)
                      ?.valor ?? item.dadosAnteriores;
                  const valorNovo =
                    (item.dadosNovos as { valor?: unknown } | null)?.valor ??
                    item.dadosNovos;

                  return (
                    <TableRow key={item.id}>
                      <TableCell className={stickyColumnCellClass}>
                        {formatShortDateTimeBR(item.criadoEm)}
                      </TableCell>
                      <TableCell>{item.usuarioNome ?? "Sistema"}</TableCell>
                      <TableCell>{item.acao}</TableCell>
                      <TableCell>{item.tabela}</TableCell>
                      <TableCell>{campo}</TableCell>
                      <TableCell className="max-w-[220px] whitespace-pre-wrap text-[var(--color-neutral-600)]">
                        {formatAuditValue(valorAnterior)}
                      </TableCell>
                      <TableCell className="max-w-[220px] whitespace-pre-wrap text-[var(--color-neutral-600)]">
                        {formatAuditValue(valorNovo)}
                      </TableCell>
                      <TableCell className="max-w-[260px] whitespace-pre-wrap text-[var(--color-neutral-600)]">
                        {cleanDisplayText(item.descricao)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <Alert variant="info" className="mt-4">
          Nenhuma auditoria registrada para este processo.
        </Alert>
      )}
    </>
  );
}
