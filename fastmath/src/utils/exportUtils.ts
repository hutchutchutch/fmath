/**
 * Converts an array of objects to a CSV string
 * @param data Array of objects to convert
 * @param headers Optional custom headers (if not provided, will use object keys)
 * @returns CSV formatted string
 */
export const convertToCSV = <T extends Record<string, any>>(
  data: T[],
  headers?: { key: keyof T; label: string }[]
): string => {
  if (!data || !data.length) return '';

  // If no headers provided, use object keys from first item
  const csvHeaders = headers || 
    Object.keys(data[0]).map(key => ({ key, label: key }));
  
  // Create header row
  const headerRow = csvHeaders.map(h => `"${h.label}"`).join(',');
  
  // Create data rows
  const rows = data.map(item => {
    return csvHeaders.map(header => {
      const value = item[header.key];
      // Handle different types of values to ensure proper CSV formatting
      if (value === null || value === undefined) return '""';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      return `"${value}"`;
    }).join(',');
  });
  
  // Combine header and rows
  return [headerRow, ...rows].join('\n');
};

/**
 * Triggers a file download of a CSV string
 * @param csvContent CSV content to download
 * @param filename Name of the file to download
 */
export const downloadCSV = (csvContent: string, filename: string): void => {
  // Create a blob with the CSV content
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Create a link to download the blob
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  // Append to the document, click to trigger download, then remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Formats a date as YYYY-MM-DD for use in filenames
 */
export const formatDateForFilename = (): string => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
}; 