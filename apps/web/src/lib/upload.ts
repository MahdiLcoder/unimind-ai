export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".pptx",
  ".txt",
  ".md",
] as const;

export function validateUploadFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return "Unsupported file type. Use PDF, DOCX, PPTX, TXT, or Markdown.";
  }
  if (file.size === 0) {
    return "The selected file is empty.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Files must be 20 MB or smaller.";
  }
  return null;
}
