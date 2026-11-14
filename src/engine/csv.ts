export function csvRow(fields: unknown[]): string {
  return fields
    .map((field) => {
      const value = String(field ?? '');
      const safe = typeof field === 'string' && /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
      return '"' + safe.replace(/"/g, '""') + '"';
    })
    .join(',');
}
