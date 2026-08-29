import type { CreateUserInput, UpdateUserInput, User } from "@/types/user";

const users = new Map<string, User>();

seedUsers();

function seedUsers() {
  if (users.size > 0) {
    return;
  }

  const seededAt = new Date().toISOString();

  [
    {
      id: "user-1",
      name: "Dariel Santos",
      email: "dariel@ftccsolutions.com",
      role: "admin" as const,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "user-2",
      name: "Mika Reyes",
      email: "mika@ftccsolutions.com",
      role: "manager" as const,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ].forEach((user) => users.set(user.id, user));
}

export function listUsers() {
  return Array.from(users.values()).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export function getUserById(id: string) {
  return users.get(id) ?? null;
}

export function createUser(input: CreateUserInput) {
  const timestamp = new Date().toISOString();
  const user: User = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role ?? "staff",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  users.set(user.id, user);

  return user;
}

export function updateUser(id: string, input: UpdateUserInput) {
  const current = users.get(id);

  if (!current) {
    return null;
  }

  const next: User = {
    ...current,
    name: input.name ? input.name.trim() : current.name,
    email: input.email ? input.email.trim().toLowerCase() : current.email,
    role: input.role ?? current.role,
    updatedAt: new Date().toISOString(),
  };

  users.set(id, next);

  return next;
}

export function deleteUser(id: string) {
  const current = users.get(id);

  if (!current) {
    return null;
  }

  users.delete(id);

  return current;
}
