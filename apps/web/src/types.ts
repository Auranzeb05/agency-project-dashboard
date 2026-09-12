export type Role = 'ADMIN' | 'PM' | 'DEVELOPER';
export type User = { id: string; name: string; email: string; role: Role; active: boolean };
export type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const statuses: Status[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
export const priorities: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const labels: Record<string, string> = {
  ADMIN: 'Administrator',
  PM: 'Project manager',
  DEVELOPER: 'Developer',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};
export type Project = {
  id: number;
  name: string;
  description: string;
  client_id: number;
  client_name: string;
  company: string;
  created_by: string;
  owner_name: string;
  archived: boolean;
  task_count: number;
  done_count: number;
  overdue_count: number;
};
export type Task = {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  description: string;
  assigned_to: string;
  assignee_name: string;
  status: Status;
  priority: Priority;
  due_date: string;
  overdue: boolean;
  version: number;
  archived: boolean;
};
export type Activity = {
  id: string;
  task_id: number;
  task_title: string;
  project_id: number;
  project_name: string;
  actor_name: string;
  kind: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};
export type Client = { id: number; name: string; email: string; company: string };
export type Notification = {
  id: string;
  task_id: number;
  project_id: number;
  message: string;
  read_at: string | null;
  created_at: string;
};
export type TaskList = { items: Task[]; total: number; page: number; limit: number };
export type Dashboard = {
  counts: {
    total_tasks: number;
    overdue: number;
    todo: number;
    in_progress: number;
    in_review: number;
    done: number;
  };
  priority: { priority: Priority; count: number }[];
  upcoming: Task[];
  projects: Project[];
  total_projects: number;
  online?: number;
};
