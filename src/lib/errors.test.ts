import { describe, it, expect } from "vitest";
import { friendlyError } from "./errors";

describe("friendlyError", () => {
    it("maps 'cannot open file' errors", () => {
        expect(friendlyError("Cannot open file: No such file or directory (os error 2)")).toContain("could not be found");
    });

    it("maps 'no such file or directory' errors", () => {
        expect(friendlyError("No such file or directory")).toContain("could not be found");
    });

    it("maps 'book file not found' errors", () => {
        expect(friendlyError("Book file not found at '/path/to/book.epub'")).toContain("could not be found");
    });

    it("maps pdfium errors to PDF-specific message", () => {
        expect(friendlyError("pdfium library not found: some details")).toContain("PDF support");
    });

    it("does not map pdfium errors to file-not-found", () => {
        expect(friendlyError("pdfium library not found")).not.toContain("could not be found");
    });

    it("maps duplicate errors", () => {
        expect(friendlyError("Book is a duplicate")).toContain("already in your library");
    });

    it("returns generic message for unknown errors", () => {
        expect(friendlyError("something unknown")).toBe("Something went wrong. Please try again.");
    });
});
