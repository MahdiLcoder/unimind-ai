import { describe, expect, it } from "vitest";
import { validateUploadFile } from "./upload";

function file(name: string, size: number): File {
  return new File([new Uint8Array(size)], name);
}

describe("validateUploadFile", () => {
  it("accepts supported document types", () => {
    for (const name of ["notes.pdf", "cv.docx", "slides.pptx", "a.txt", "a.md"]) {
      expect(validateUploadFile(file(name, 32))).toBeNull();
    }
  });

  it("rejects unsupported types", () => {
    expect(validateUploadFile(file("image.png", 32))).toMatch(/Unsupported file type/);
  });

  it("rejects empty files", () => {
    expect(validateUploadFile(file("empty.pdf", 0))).toMatch(/empty/);
  });

  it("rejects files larger than the 20 MB backend limit", () => {
    expect(validateUploadFile(file("huge.pdf", 20 * 1024 * 1024 + 1))).toMatch(/20 MB/);
  });
});
