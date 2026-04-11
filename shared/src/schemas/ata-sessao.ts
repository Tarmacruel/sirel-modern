import { z } from "zod";

export const ataSessaoProcessInputSchema = z
  .object({
    sourcePath: z.string().trim().min(3).optional(),
    documentoId: z.number().int().positive().optional(),
    outputDir: z.string().trim().min(3).optional(),
    generatedByName: z.string().trim().min(2).max(160).optional(),
  })
  .refine((value) => Boolean(value.sourcePath || value.documentoId), {
    message: "Informe sourcePath ou documentoId para processar a ata.",
    path: ["sourcePath"],
  });

export const ataSessaoReportArtifactSchema = z.object({
  label: z.string(),
  path: z.string(),
  type: z.enum(["pdf", "xlsx", "json", "log"]),
});

export const ataSessaoProcessResultSchema = z.object({
  sourceFile: z.string(),
  outputDir: z.string(),
  generatedAt: z.string(),
  summary: z.object({
    totalLotes: z.number().int().nonnegative(),
    adjudicados: z.number().int().nonnegative(),
    malsucedidos: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    parsingErrors: z.number().int().nonnegative(),
  }),
  artifacts: z.array(ataSessaoReportArtifactSchema),
});

export type AtaSessaoProcessInput = z.infer<typeof ataSessaoProcessInputSchema>;
export type AtaSessaoProcessResult = z.infer<typeof ataSessaoProcessResultSchema>;
