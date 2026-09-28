import * as React from "react"
import {
  getGetProjectDocumentPreviewQueryKey,
  useGetProjectDocumentPreview,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Download, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react"

export type ProjectDocumentPreviewFile = {
  id: string
  name: string
  url: string
  contentType: string
}

export function isOfficePreviewableDocument(file: Pick<ProjectDocumentPreviewFile, "name" | "contentType">) {
  const extension = file.name.toLowerCase().split(".").at(-1)
  const contentType = (file.contentType ?? "").toLowerCase()
  return ["doc", "docx", "docm", "dot", "dotx", "dotm"].includes(extension ?? "") ||
    contentType.includes("wordprocessingml") ||
    contentType.includes("application/msword") ||
    contentType.includes("vnd.ms-word") ||
    ["xls", "xlsx", "xlsm", "xlt", "xltx", "xltm"].includes(extension ?? "") ||
    contentType.includes("spreadsheetml") ||
    contentType.includes("sheet.macroenabled") ||
    contentType.includes("application/vnd.ms-excel")
}

function columnLabel(index: number) {
  let number = index + 1
  let label = ""
  while (number > 0) {
    const remainder = (number - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    number = Math.floor((number - 1) / 26)
  }
  return label
}

export function ProjectDocumentPreviewDialog({
  projectId,
  file,
  open,
  onOpenChange,
}: {
  projectId: string
  file: ProjectDocumentPreviewFile | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading, isError, refetch } = useGetProjectDocumentPreview(
    projectId,
    file?.id ?? "",
    {
      query: {
        queryKey: getGetProjectDocumentPreviewQueryKey(projectId, file?.id ?? ""),
        enabled: open && Boolean(file),
        retry: false,
      },
    },
  )
  const [activeSheetName, setActiveSheetName] = React.useState("")

  React.useEffect(() => {
    setActiveSheetName(data?.worksheets[0]?.name ?? "")
  }, [data, file?.id])

  const activeSheet = data?.worksheets.find((sheet) => sheet.name === activeSheetName) ?? data?.worksheets[0]
  const columnCount = activeSheet?.rows.reduce((count, row) => Math.max(count, row.length), 0) ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4 pr-12">
          <DialogTitle className="truncate">{file?.name ?? "Document preview"}</DialogTitle>
          <DialogDescription>
            Preview this private project document before downloading the original.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-64 flex-1 overflow-auto px-6 py-5">
          {isLoading && (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
              <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
              <span>Preparing preview…</span>
            </div>
          )}

          {isError && (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-md text-sm text-muted-foreground">
                The preview could not be generated. You can still download the original file.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          )}

          {data?.kind === "word" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                Word document
              </div>
              <pre
                aria-label={`Preview of ${file?.name ?? "Word document"}`}
                className="max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-4 font-sans text-sm leading-relaxed"
              >
                {data.text || "This document contains no readable text."}
              </pre>
            </div>
          )}

          {data?.kind === "excel" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden="true" />
                  Excel workbook
                </div>
                {data.worksheets.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Worksheet</span>
                    <select
                      aria-label="Worksheet"
                      className="h-9 max-w-64 rounded-md border border-input bg-background px-3 text-sm"
                      value={activeSheet?.name ?? ""}
                      onChange={(event) => setActiveSheetName(event.target.value)}
                    >
                      {data.worksheets.map((sheet) => (
                        <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {activeSheet ? (
                <div className="max-h-[65dvh] overflow-auto rounded-md border">
                  <table className="w-full border-collapse text-left text-xs" aria-label={`Worksheet ${activeSheet.name}`}>
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr>
                        <th scope="col" className="w-12 border-b border-r px-2 py-2 text-right font-medium text-muted-foreground">#</th>
                        {Array.from({ length: columnCount }, (_, index) => (
                          <th key={index} scope="col" className="min-w-20 border-b border-r px-2 py-2 font-medium text-muted-foreground">
                            {columnLabel(index)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="odd:bg-background even:bg-muted/20">
                          <th scope="row" className="border-r border-b px-2 py-1.5 text-right font-normal tabular-nums text-muted-foreground">
                            {rowIndex + 1}
                          </th>
                          {Array.from({ length: columnCount }, (_, columnIndex) => {
                            const value = row[columnIndex] ?? ""
                            return (
                              <td key={columnIndex} title={value} className="max-w-80 border-r border-b px-2 py-1.5 align-top">
                                <span className="block whitespace-pre-wrap break-words">{value}</span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex min-h-52 items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
                  This workbook has no readable worksheets.
                </div>
              )}
            </div>
          )}

          {data?.truncated && (
            <p className="mt-3 text-xs text-muted-foreground">
              {data.kind === "word"
                ? "This text preview shows only the first 24,000 characters. Download the original for the complete document."
                : "This preview shows up to 100 rows and 16 columns per worksheet, up to 8 worksheets. Long cell values may be shortened; download the original for the complete workbook."}
            </p>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:justify-between">
          <p className="self-center text-xs text-muted-foreground">
            The original file remains unchanged.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            {file && (
              <Button asChild type="button" variant="outline">
                <a href={file.url} download={file.name} aria-label={`Download original ${file.name}`}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Download original
                </a>
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}