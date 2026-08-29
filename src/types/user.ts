export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "staff";
  createdAt: string;
  updatedAt: string;
};

export type CreateUserInput = {
  name: string;
  email: string;
  role?: User["role"];
};

export type UserByIdRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export type UpdateUserInput = Partial<CreateUserInput>;
