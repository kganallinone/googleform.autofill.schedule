import type { ContactInquiryInput } from "@/types/contact";
import type { CreateUserInput, UpdateUserInput, User } from "@/types/user";

const validRoles: User["role"][] = ["admin", "manager", "staff"];

export function isContactInquiryInput(value: unknown): value is ContactInquiryInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ContactInquiryInput>;

  return (
    typeof candidate.companyName === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.message === "string"
  );
}

export function validateContactInquiry(input: ContactInquiryInput) {
  const companyName = input.companyName.trim();
  const email = input.email.trim();
  const message = input.message.trim();

  if (!companyName || !email || !message) {
    return {
      ok: false as const,
      message: "Company name, email, and message are required.",
    };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    return {
      ok: false as const,
      message: "Please provide a valid email address.",
    };
  }

  return {
    ok: true as const,
    data: {
      companyName,
      email,
      message,
    },
  };
}

export function isUpdateUserInput(value: unknown): value is UpdateUserInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UpdateUserInput>;

  return (
    (candidate.name === undefined || typeof candidate.name === "string") &&
    (candidate.email === undefined || typeof candidate.email === "string") &&
    (candidate.role === undefined ||
      (typeof candidate.role === "string" && validRoles.includes(candidate.role as User["role"])))
  );
}

export function validateUpdateUserInput(input: UpdateUserInput) {
  if (input.name === undefined && input.email === undefined && input.role === undefined) {
    return {
      ok: false as const,
      message: "Provide at least one field to update.",
    };
  }

  if (input.name !== undefined && !input.name.trim()) {
    return {
      ok: false as const,
      message: "Name cannot be empty.",
    };
  }

  if (input.email !== undefined) {
    const email = input.email.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return {
        ok: false as const,
        message: "Please provide a valid email address.",
      };
    }
  }

  if (input.role !== undefined && !validRoles.includes(input.role)) {
    return {
      ok: false as const,
      message: "Role must be admin, manager, or staff.",
    };
  }

  return {
    ok: true as const,
    data: input,
  };
}

export function isCreateUserInput(value: unknown): value is CreateUserInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CreateUserInput>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.email === "string" &&
    (candidate.role === undefined ||
      (typeof candidate.role === "string" && validRoles.includes(candidate.role as User["role"])))
  );
}

export function validateCreateUserInput(input: CreateUserInput) {
  const name = input.name.trim();
  const email = input.email.trim();
  const role = input.role ?? "staff";

  if (!name || !email) {
    return {
      ok: false as const,
      message: "Name and email are required.",
    };
  }

  if (!validRoles.includes(role)) {
    return {
      ok: false as const,
      message: "Role must be admin, manager, or staff.",
    };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    return {
      ok: false as const,
      message: "Please provide a valid email address.",
    };
  }

  return {
    ok: true as const,
    data: {
      name,
      email,
      role,
    },
  };
}
