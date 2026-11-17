import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkspaceContent from "./workspace-content";
import * as api from "@/lib/api";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn().mockResolvedValue("mock-jwt-token"),
  }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: "Alex Rivera",
      primaryEmailAddress: { emailAddress: "alex@university.edu" },
    },
  }),
  UserButton: () => <div data-testid="user-button">Profile</div>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("WorkspaceContent Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty document notice when no documents exist", async () => {
    vi.spyOn(api, "apiRequest").mockImplementation(async (endpoint) => {
      if (endpoint === "/api/v1/documents") {
        return [];
      }
      if (endpoint === "/api/v1/courses" || endpoint === "/api/v1/agents/conversations") {
        return [];
      }
      return {} as never;
    });

    render(<WorkspaceContent />);

    await waitFor(() => {
      expect(screen.getByText("No documents uploaded yet")).toBeDefined();
    });
    expect(screen.getByText("AI Workspace")).toBeDefined();
    expect(screen.getByText("Ask your university assistant")).toBeDefined();
  });

  it("displays uploaded documents list", async () => {
    vi.spyOn(api, "apiRequest").mockImplementation(async (endpoint) => {
      if (endpoint === "/api/v1/documents") {
        return [
          {
            id: "33333333-3333-3333-3333-333333333333",
            source_filename: "algorithms-syllabus.pdf",
            title: "Algorithms Syllabus",
            mime_type: "application/pdf",
            course_id: null,
            created_at: "2026-02-01T00:00:00Z",
          },
        ];
      }
      if (endpoint === "/api/v1/courses" || endpoint === "/api/v1/agents/conversations") {
        return [];
      }
      return {} as never;
    });

    render(<WorkspaceContent />);

    await waitFor(() => {
      expect(screen.getByText("Algorithms Syllabus")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Delete algorithms-syllabus.pdf" })).toBeDefined();
  });

  it("allows user to type a question into the chat input", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "apiRequest").mockImplementation(async (endpoint) => {
      if (
        endpoint === "/api/v1/documents" ||
        endpoint === "/api/v1/courses" ||
        endpoint === "/api/v1/agents/conversations"
      ) {
        return [];
      }
      return {} as never;
    });

    render(<WorkspaceContent />);

    await waitFor(() => {
      expect(screen.getByText("No documents uploaded yet")).toBeDefined();
    });

    const input = screen.getByPlaceholderText("Ask a question about your materials…");
    await user.type(input, "What is the policy on late homework?");
    expect((input as HTMLInputElement).value).toBe("What is the policy on late homework?");
  });
});
