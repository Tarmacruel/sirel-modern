import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

type DocumentoProcessoItem = {
  id: number;
  titulo: string;
  tipo: string;
  categoria?: string | null;
  dataReferencia?: string | Date | null;
  criadoEm: string | Date;
  arquivoUrl: string | null;
};

interface LicitacaoProcessoDocumentosModalContentProps {
  documentos: DocumentoProcessoItem[];
  formatShortDateBR: (value: string | Date | null | undefined) => string;
  formatShortDateTimeBR: (value: string | Date) => string;
  resolveServerAssetUrl: (value: string | null | undefined) => string | null;
}

export default function LicitacaoProcessoDocumentosModalContent({
  documentos,
  formatShortDateBR,
  formatShortDateTimeBR,
  resolveServerAssetUrl,
}: LicitacaoProcessoDocumentosModalContentProps) {
  if (!documentos.length) {
    return (
      <Alert variant="info">
        Este processo ainda nao possui documentos vinculados.
      </Alert>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white shadow-[0_12px_24px_-24px_rgba(15,26,109,0.22)]">
      <Table className="min-w-[1080px]">
        <TableHead>
          <tr>
            <TableHeaderCell>#</TableHeaderCell>
            <TableHeaderCell>Titulo</TableHeaderCell>
            <TableHeaderCell>Tipo</TableHeaderCell>
            <TableHeaderCell>Categoria</TableHeaderCell>
            <TableHeaderCell>Data de referencia</TableHeaderCell>
            <TableHeaderCell>Adicionado em</TableHeaderCell>
            <TableHeaderCell className="text-right">Arquivo</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {documentos.map((item, index) => (
            <TableRow key={item.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>{item.titulo}</TableCell>
              <TableCell>{item.tipo}</TableCell>
              <TableCell>{item.categoria ?? "-"}</TableCell>
              <TableCell>{formatShortDateBR(item.dataReferencia)}</TableCell>
              <TableCell>{formatShortDateTimeBR(item.criadoEm)}</TableCell>
              <TableCell className="text-right">
                <a
                  href={resolveServerAssetUrl(item.arquivoUrl) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!item.arquivoUrl}
                  >
                    Abrir
                  </Button>
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
