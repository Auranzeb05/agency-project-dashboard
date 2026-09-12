export const roles = ['ADMIN', 'PM', 'DEVELOPER'] as const;
export const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Role = (typeof roles)[number];
export type User = { id: string; name: string; email: string; role: Role; active: boolean };
export type Identity = User & { session_id: string; exp: number };
export type Project = {
  id: number;
  name: string;
  description: string;
  client_id: number;
  created_by: string;
  archived: boolean;
};
export type Task = {
  id: number;
  project_id: number;
  title: string;
  description: string;
  assigned_to: string;
  status: (typeof statuses)[number];
  priority: (typeof priorities)[number];
  due_date: string;
  overdue: boolean;
  version: number;
  created_by: string;
  archived: boolean;
  assignee_name: string;
  project_name: string;
};
export type Activity = {
  id: string;
  task_id: number;
  actor_id: string | null;
  actor_name: string;
  kind: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  task_title: string;
  project_id: number;
  project_name: string;
};
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const notFound = () =>
  new AppError(404, 'NOT_FOUND', 'This item was not found or is not available to you.');
declare global {
  namespace Express {
    interface Request {
      identity: Identity;
      requestId: string;
    }
  }
}
