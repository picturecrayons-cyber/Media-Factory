export type LoopAnalyticsCsvRow = {
  metric: string;
  value: string | number | boolean | null;
  unit?: string;
  source?: string;
};

function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet formula execution for values originating from titles or labels.
  if (/^[\\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function buildLoopAnalyticsCsv(rows: LoopAnalyticsCsvRow[]): string {
  const header = ["metric", "value", "unit", "source"];
  return [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [row.metric, row.value, row.unit ?? "", row.source ?? ""].map(csvCell).join(",")
    ),
  ].join("\\r\\n") + "\\r\\n";
}
