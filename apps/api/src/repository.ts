import type { z } from 'zod';
import { pool, transaction, type DB } from './db.js';
import { AppError, notFound, type Activity, type Project, type Task, type User } from './model.js';
import type { activityFilters, filters } from './validation.js';

export function taskScope(user: User, values: unknown[], t = 't', p = 'p') {
  if (user.role === 'ADMIN') return 'TRUE';
  values.push(user.id);
  return user.role === 'PM'
    ? `${p}.created_by=$${values.length}`
    : `${t}.assigned_to=$${values.length}`;
}
export const taskSelect = `SELECT t.*, t.due_date::text, u.name assignee_name, p.name project_name, p.created_by, p.archived
 FROM tasks t JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=t.assigned_to`;
export const activitySelect = `SELECT a.*, COALESCE(u.name,'Scheduler') actor_name,t.title task_title,t.project_id,p.name project_name
 FROM activities a JOIN tasks t ON t.id=a.task_id JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=a.actor_id`;
export async function accessibleTask(
  user: User,
  taskId: number,
  db: DB = pool,
  lock = false,
): Promise<Task> {
  const values: unknown[] = [taskId];
  const scope = taskScope(user, values);
  const result = await db.query<Task>(
    `${taskSelect} WHERE t.id=$1 AND ${scope}${lock ? ' FOR UPDATE OF t' : ''}`,
    values,
  );
  if (!result.rows[0]) throw notFound();
  return result.rows[0];
}
export async function accessibleProject(
  user: User,
  projectId: number,
  db: DB = pool,
  lock = false,
): Promise<Project> {
  const values: unknown[] = [projectId];
  const scope =
    user.role === 'ADMIN'
      ? 'TRUE'
      : user.role === 'PM'
        ? 'p.created_by=$2'
        : 'EXISTS (SELECT 1 FROM tasks t WHERE t.project_id=p.id AND t.assigned_to=$2)';
  if (user.role !== 'ADMIN') values.push(user.id);
  const result = await db.query<Project>(
    `SELECT p.* FROM projects p WHERE p.id=$1 AND ${scope}${lock ? ' FOR UPDATE OF p' : ''}`,
    values,
  );
  if (!result.rows[0]) throw notFound();
  return result.rows[0];
}
export async function listProjects(user: User) {
  const values: unknown[] = [];
  const scope = taskScope(user, values);
  // Developers never get project descriptions, client details, or totals of other people's tasks.
  if (user.role === 'DEVELOPER')
    return (
      await pool.query(
        `SELECT p.id,p.name,p.archived,count(*)::int task_count,
 count(*) FILTER (WHERE t.status='DONE')::int done_count, count(*) FILTER (WHERE t.overdue)::int overdue_count
 FROM projects p JOIN tasks t ON t.project_id=p.id WHERE ${scope} GROUP BY p.id ORDER BY p.id`,
        values,
      )
    ).rows;
  return (
    await pool.query(
      `SELECT p.*,c.name client_name,c.company,owner.name owner_name,
 count(t.id)::int task_count,count(t.id) FILTER (WHERE t.status='DONE')::int done_count,
 count(t.id) FILTER (WHERE t.overdue)::int overdue_count
 FROM projects p JOIN clients c ON c.id=p.client_id JOIN users owner ON owner.id=p.created_by
 LEFT JOIN tasks t ON t.project_id=p.id WHERE ${scope} GROUP BY p.id,c.id,owner.id ORDER BY p.id`,
      values,
    )
  ).rows;
}
export async function listTasks(user: User, input: z.infer<typeof filters>, db: DB = pool) {
  if (input.project_id) await accessibleProject(user, input.project_id, db);
  const values: unknown[] = [];
  const conditions = [taskScope(user, values)];
  for (const [column, value, op] of [
    ['t.project_id', input.project_id, '='],
    ['t.status', input.status, '='],
    ['t.priority', input.priority, '='],
    ['t.due_date', input.due_from, '>='],
    ['t.due_date', input.due_to, '<='],
  ] as const) {
    if (value !== undefined) {
      values.push(value);
      conditions.push(`${column}${op}$${values.length}`);
    }
  }
  const where = conditions.join(' AND ');
  const total = Number(
    (
      await db.query(
        `SELECT count(*) FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${where}`,
        values,
      )
    ).rows[0].count,
  );
  values.push(input.limit, (input.page - 1) * input.limit);
  const items = (
    await db.query<Task>(
      `${taskSelect} WHERE ${where} ORDER BY t.priority DESC,t.due_date,t.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )
  ).rows;
  return { items, total, page: input.page, limit: input.limit };
}
export async function getActivity(user: User, input: z.infer<typeof activityFilters>) {
  return transaction(async (db) => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    if (input.project_id) await accessibleProject(user, input.project_id, db);
    if (input.task_id) await accessibleTask(user, input.task_id, db);
    const values: unknown[] = [];
    const conditions = [taskScope(user, values)];
    if (input.project_id) {
      values.push(input.project_id);
      conditions.push(`t.project_id=$${values.length}`);
    }
    if (input.task_id) {
      values.push(input.task_id);
      conditions.push(`t.id=$${values.length}`);
    }
    const cursor = (await db.query('SELECT COALESCE(max(id),0)::text cursor FROM activities'))
      .rows[0].cursor as string;
    if (input.after) {
      values.push(input.after);
      conditions.push(`a.id>$${values.length}`);
    }
    const result = await db.query<Activity>(
      `${activitySelect} WHERE ${conditions.join(' AND ')} ORDER BY a.id DESC LIMIT 20`,
      values,
    );
    return { items: result.rows, cursor };
  });
}
export async function notificationState(user: User, db: DB = pool) {
  const values: unknown[] = [user.id];
  const scope = taskScope(user, values);
  const from = `FROM notifications n JOIN tasks t ON t.id=n.task_id JOIN projects p ON p.id=t.project_id WHERE n.user_id=$1 AND ${scope}`;
  const items = (
    await db.query(
      `SELECT n.*,t.title task_title,t.project_id ${from} ORDER BY n.id DESC LIMIT 50`,
      values,
    )
  ).rows;
  const unread = Number(
    (await db.query(`SELECT count(*) ${from} AND n.read_at IS NULL`, values)).rows[0].count,
  );
  return { items, unread };
}
export async function readNotifications(user: User, notificationId?: string) {
  const values: unknown[] = [user.id];
  const scope = taskScope(user, values);
  let match = '';
  if (notificationId) {
    values.push(notificationId);
    match = ` AND n.id=$${values.length}`;
  }
  await pool.query(
    `UPDATE notifications n SET read_at=COALESCE(n.read_at,now()) FROM tasks t JOIN projects p ON p.id=t.project_id WHERE n.task_id=t.id AND n.user_id=$1 AND ${scope}${match}`,
    values,
  );
}
export async function dashboard(user: User) {
  const values: unknown[] = [];
  const scope = taskScope(user, values);
  const counts = (
    await pool.query(
      `SELECT count(*)::int total_tasks,count(*) FILTER (WHERE t.overdue)::int overdue,
 count(*) FILTER (WHERE status='TODO')::int todo,count(*) FILTER (WHERE status='IN_PROGRESS')::int in_progress,
 count(*) FILTER (WHERE status='IN_REVIEW')::int in_review,count(*) FILTER (WHERE status='DONE')::int done
 FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${scope}`,
      values,
    )
  ).rows[0];
  const priority = (
    await pool.query(
      `SELECT t.priority,count(*)::int count FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${scope} GROUP BY t.priority ORDER BY t.priority DESC`,
      values,
    )
  ).rows;
  const upcoming = (
    await pool.query<Task>(
      `${taskSelect} WHERE ${scope} AND t.status<>'DONE' AND t.due_date >= CURRENT_DATE AND t.due_date < date_trunc('week',CURRENT_DATE)::date + 7 ORDER BY t.due_date,t.priority DESC LIMIT 20`,
      values,
    )
  ).rows;
  const projects = await listProjects(user);
  return { counts, priority, upcoming, projects, total_projects: projects.length };
}
export async function addActivity(
  db: DB,
  taskId: number,
  actorId: string | null,
  kind: string,
  oldValue: string | null,
  newValue: string | null,
) {
  return (
    await db.query<{ id: string }>(
      'INSERT INTO activities(task_id,actor_id,kind,old_value,new_value) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [taskId, actorId, kind, oldValue, newValue],
    )
  ).rows[0].id;
}
export async function addNotification(db: DB, userId: string, taskId: number, message: string) {
  await db.query('INSERT INTO notifications(user_id,task_id,message) VALUES ($1,$2,$3)', [
    userId,
    taskId,
    message,
  ]);
}
export async function assertDeveloper(db: DB, userId: string) {
  if (
    !(await db.query("SELECT 1 FROM users WHERE id=$1 AND active AND role='DEVELOPER'", [userId]))
      .rowCount
  )
    throw new AppError(400, 'INVALID_ASSIGNEE', 'Choose an active developer.');
}
export async function activityAudience(taskId: number) {
  return (
    await pool.query<User>(
      `SELECT u.id,u.name,u.email,u.role,u.active FROM users u WHERE u.active AND
 (u.role='ADMIN' OR (u.role='PM' AND EXISTS(SELECT 1 FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=$1 AND p.created_by=u.id))
 OR (u.role='DEVELOPER' AND EXISTS(SELECT 1 FROM tasks t WHERE t.id=$1 AND t.assigned_to=u.id)))`,
      [taskId],
    )
  ).rows;
}
