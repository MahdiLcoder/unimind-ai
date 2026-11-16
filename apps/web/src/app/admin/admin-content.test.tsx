import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminContent from "./admin-content";
import * as api from "@/lib/api";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("mock-jwt-token"),
  }),
  UserButton: () => <div data-testid="user-button">User Profile</div>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("AdminContent Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows unauthorized message if user role is student", async () => {
    vi.spyOn(api, "apiRequest").mockImplementation(async (endpoint) => {
      if (endpoint === "/api/v1/users/me") {
        return {
          clerk_user_id: "user_student",
          email: "student@example.com",
          role: "student",
          created_at: "2026-01-01T00:00:00Z",
        };
      }
      return {} as never;
    });

    render(<AdminContent />);

    await waitFor(() => {
      expect(screen.getByText("Administrator access is required.")).toBeDefined();
    });
  });

  it("renders users and administration panels for administrator", async () => {
    vi.spyOn(api, "apiRequest").mockImplementation(async (endpoint) => {
      if (endpoint === "/api/v1/users/me") {
        return {
          clerk_user_id: "user_admin",
          email: "admin@example.com",
          role: "administrator",
          created_at: "2026-01-01T00:00:00Z",
        };
      }
      if (endpoint === "/api/v1/users?limit=100") {
        return [
          {
            clerk_user_id: "user_admin",
            email: "admin@example.com",
            role: "administrator",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            clerk_user_id: "user_target",
            email: "student@example.com",
            role: "student",
            created_at: "2026-01-02T00:00:00Z",
          },
        ];
      }
      if (endpoint === "/api/v1/admin/features") {
        return { features: [{ key: "rag_reranking", enabled: true }] };
      }
      if (endpoint === "/api/v1/admin/workspaces?limit=100") {
        return [
          {
            id: "11111111-1111-1111-1111-111111111111",
            name: "CS Workspace",
            created_by: "user_admin",
            created_at: "2026-01-01T00:00:00Z",
            course_count: 3,
          },
        ];
      }
      if (endpoint === "/api/v1/admin/audit-logs?limit=100") {
        return [
          {
            id: "22222222-2222-2222-2222-222222222222",
            actor_id: "user_admin",
            action: "user.role_updated",
            resource_type: "user",
            resource_id: "user_target",
            details: { new_role: "professor" },
            created_at: "2026-01-03T00:00:00Z",
          },
        ];
      }
      return {} as never;
    });

    render(<AdminContent />);

    await waitFor(() => {
      expect(screen.getByText("Administration")).toBeDefined();
    });

    expect(screen.getByText("admin@example.com")).toBeDefined();
    expect(screen.getByText("student@example.com")).toBeDefined();
    expect(screen.getByText("CS Workspace")).toBeDefined();
    expect(screen.getByText("rag reranking")).toBeDefined();
    expect(screen.getByText("user.role_updated")).toBeDefined();
  });

  it("triggers role update when changing user role select option", async () => {
    const user = userEvent.setup();
    const apiRequestSpy = vi.spyOn(api, "apiRequest").mockImplementation(async (endpoint) => {
      if (endpoint === "/api/v1/users/me") {
        return {
          clerk_user_id: "user_admin",
          email: "admin@example.com",
          role: "administrator",
          created_at: "2026-01-01T00:00:00Z",
        };
      }
      if (endpoint === "/api/v1/users?limit=100") {
        return [
          {
            clerk_user_id: "user_admin",
            email: "admin@example.com",
            role: "administrator",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            clerk_user_id: "user_student",
            email: "student@example.com",
            role: "student",
            created_at: "2026-01-02T00:00:00Z",
          },
        ];
      }
      if (endpoint === "/api/v1/admin/features") return { features: [] };
      if (endpoint === "/api/v1/admin/workspaces?limit=100") return [];
      if (endpoint === "/api/v1/admin/audit-logs?limit=100") return [];
      if (endpoint === "/api/v1/users/user_student/role") {
        return {
          clerk_user_id: "user_student",
          email: "student@example.com",
          role: "professor",
          created_at: "2026-01-02T00:00:00Z",
        };
      }
      return {} as never;
    });

    render(<AdminContent />);

    await waitFor(() => {
      expect(screen.getByText("student@example.com")).toBeDefined();
    });

    const select = screen.getByLabelText("Role for student@example.com");
    await user.selectOptions(select, "professor");

    await waitFor(() => {
      expect(apiRequestSpy).toHaveBeenCalledWith(
        "/api/v1/users/user_student/role",
        expect.anything(),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ role: "professor" }),
        }),
      );
    });
  });
});
