import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import { pool, transaction } from './db.js';
import { AppError, type User } from './model.js';
import * as repo from './repository.js';
import type * as input from './validation.js';
export type Change = { taskId?: number; previousAssignee?: string; userId?: string; all?: boolean };
let onChange: (change: Change) => Promise<void> = async () => {};
export function setChangeHandler(handler: typeof onChange) {
  onChange = handler;
}
// A failed delivery never undoes a committed mutation; reconnection reads persistent state.
export async function changed(change: Change) {
  try {
    await onChange(change);
  } catch (error) {
    console.error('Live delivery failed:', error instanceof Error ? error.message : error);
  }
}
export async function createTask(
  user: User,
  projectId: number,
  data: z.infer<typeof input.taskInput>,
) {
  const task = await transaction(async (db) => {
    const project = await repo.accessibleProject(user, projectId, db, true);
    if (project.archived)
      throw new AppError(409, 'ARCHIVED', 'Restore this project before adding tasks.');
    await repo.assertDeveloper(db, data.assigned_to);
    const t = (
      await db.query(
        `INSERT INTO tasks(project_id,title,description,assigned_to,status,priority,due_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          projectId,
          data.title,
          data.description,
          data.assigned_to,
          data.status,
          data.priority,
          data.due_date,
        ],
      )
    ).rows[0];
    await repo.addActivity(db, t.id, user.id, 'created', null, data.title);
    await repo.addNotification(db, data.assigned_to, t.id, `You were assigned “${data.title}”.`);
    if (data.status === 'IN_REVIEW')
      await repo.addNotification(
        db,
        project.created_by,
        t.id,
        `“${data.title}” is ready for review.`,
      );
    return t;
  }, true);
  await changed({ taskId: task.id });
  return task;
}
export async function updateTask(user: User, taskId: number, data: z.infer<typeof input.taskEdit>) {
  const result = await transaction(async (db) => {
    const task = await repo.accessibleTask(user, taskId, db, true);
    if (task.archived)
      throw new AppError(409, 'ARCHIVED', 'Restore this project before changing its tasks.');
    if (task.version !== data.version)
      throw new AppError(
        409,
        'STALE_TASK',
        'This task changed while you were editing it. Reload it and try again.',
      );
    if (data.assigned_to) await repo.assertDeveloper(db, data.assigned_to);
    const next = { ...task, ...data };
    const changedFields = (
      ['title', 'description', 'assigned_to', 'status', 'priority', 'due_date'] as const
    ).filter((k) => next[k] !== task[k]);
    if (!changedFields.length) return { task, previousAssignee: undefined };
    const updated = (
      await db.query(
        `UPDATE tasks SET title=$2,description=$3,assigned_to=$4,status=$5::task_status,priority=$6,due_date=$7::date,
   overdue=CASE WHEN $5::task_status='DONE' OR $7::date>=CURRENT_DATE THEN false ELSE overdue END,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
        [
          taskId,
          next.title,
          next.description,
          next.assigned_to,
          next.status,
          next.priority,
          next.due_date,
        ],
      )
    ).rows[0];
    if (next.status !== task.status) {
      await repo.addActivity(db, taskId, user.id, 'status', task.status, next.status);
      if (next.status === 'IN_REVIEW')
        await repo.addNotification(
          db,
          task.created_by,
          taskId,
          `“${next.title}” is ready for review.`,
        );
    }
    let previousAssignee: string | undefined;
    if (next.assigned_to !== task.assigned_to) {
      previousAssignee = task.assigned_to;
      const assignee = (await db.query('SELECT name FROM users WHERE id=$1', [next.assigned_to]))
        .rows[0];
      await repo.addActivity(db, taskId, user.id, 'assigned', task.assignee_name, assignee.name);
      await repo.addNotification(
        db,
        next.assigned_to,
        taskId,
        `You were assigned “${next.title}”.`,
      );
    }
    const other = changedFields.filter((k) => k !== 'status' && k !== 'assigned_to');
    if (other.length)
      await repo.addActivity(db, taskId, user.id, 'updated', null, other.join(', '));
    return { task: updated, previousAssignee };
  }, true);
  await changed({ taskId, previousAssignee: result.previousAssignee });
  return result.task;
}
export async function runOverdueJob() {
  const taskIds = await transaction(async (db) => {
    const tasks = (
      await db.query(
        `UPDATE tasks SET overdue=true,version=version+1,updated_at=now() WHERE due_date<CURRENT_DATE AND status<>'DONE' AND NOT overdue RETURNING id`,
      )
    ).rows;
    for (const t of tasks) await repo.addActivity(db, t.id, null, 'overdue', null, 'Overdue');
    return tasks.map((t) => t.id as number);
  }, true);
  for (const taskId of taskIds) await changed({ taskId });
  return taskIds.length;
}
export async function createProject(user: User, data: z.infer<typeof input.projectInput>) {
  if (!(await pool.query('SELECT 1 FROM clients WHERE id=$1', [data.client_id])).rowCount)
    throw new AppError(400, 'INVALID_REFERENCE', 'Choose an existing client.');
  const project = (
    await pool.query(
      'INSERT INTO projects(name,description,client_id,created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [data.name, data.description, data.client_id, user.id],
    )
  ).rows[0];
  await changed({ all: true });
  return project;
}
export async function editProject(
  user: User,
  projectId: number,
  data: z.infer<typeof input.projectEdit>,
) {
  const project = await transaction(async (db) => {
    const old = await repo.accessibleProject(user, projectId, db, true),
      next = { ...old, ...data };
    return (
      await db.query(
        'UPDATE projects SET name=$2,description=$3,client_id=$4,archived=$5 WHERE id=$1 RETURNING *',
        [projectId, next.name, next.description, next.client_id, next.archived],
      )
    ).rows[0];
  });
  await changed({ all: true });
  return project;
}
export async function getClients(user: User) {
  if (user.role === 'ADMIN') return (await pool.query('SELECT * FROM clients ORDER BY name')).rows;
  // PMs need a client picker to create projects; no contact details are exposed.
  return (await pool.query('SELECT id,name,company FROM clients ORDER BY name')).rows;
}
export async function saveClient(data: z.infer<typeof input.clientInput>, clientId?: number) {
  const row = clientId
    ? (
        await pool.query('UPDATE clients SET name=$2,email=$3,company=$4 WHERE id=$1 RETURNING *', [
          clientId,
          data.name,
          data.email,
          data.company,
        ])
      ).rows[0]
    : (
        await pool.query('INSERT INTO clients(name,email,company) VALUES ($1,$2,$3) RETURNING *', [
          data.name,
          data.email,
          data.company,
        ])
      ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  await changed({ all: true });
  return row;
}
export async function getUsers(user: User) {
  return user.role === 'ADMIN'
    ? (await pool.query('SELECT id,name,email,role,active FROM users ORDER BY name')).rows
    : (
        await pool.query(
          "SELECT id,name FROM users WHERE active AND role='DEVELOPER' ORDER BY name",
        )
      ).rows;
}
export async function createUser(data: z.infer<typeof input.userInput>) {
  const hash = await bcrypt.hash(data.password, 12);
  const user = (
    await pool.query(
      'INSERT INTO users(name,email,role,password_hash) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,active',
      [data.name, data.email, data.role, hash],
    )
  ).rows[0];
  await changed({ all: true });
  return user;
}
export async function editUser(actor: User, userId: string, data: z.infer<typeof input.userEdit>) {
  if (actor.id === userId && (data.active === false || (data.role && data.role !== 'ADMIN')))
    throw new AppError(400, 'SELF_ACCESS', 'You cannot remove your own administrator access.');
  const user = await transaction(async (db) => {
    const old = (
      await db.query<User>('SELECT id,name,email,role,active FROM users WHERE id=$1 FOR UPDATE', [
        userId,
      ])
    ).rows[0];
    if (!old) throw new AppError(404, 'NOT_FOUND', 'User not found.');
    if (data.role && data.role !== old.role) {
      const dependencies = await db.query(
        'SELECT 1 FROM tasks WHERE assigned_to=$1 UNION ALL SELECT 1 FROM projects WHERE created_by=$1',
        [userId],
      );
      if (dependencies.rowCount)
        throw new AppError(
          409,
          'ROLE_IN_USE',
          'A user with task assignments or owned projects must keep their current role.',
        );
    }
    const next = { ...old, ...data };
    const row = (
      await db.query(
        'UPDATE users SET name=$2,email=$3,role=$4,active=$5 WHERE id=$1 RETURNING id,name,email,role,active',
        [userId, next.name, next.email, next.role, next.active],
      )
    ).rows[0];
    if (data.password)
      await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
        userId,
        await bcrypt.hash(data.password, 12),
      ]);
    if (data.role || data.active === false || data.password)
      await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [userId]);
    return row;
  });
  await changed({ userId, all: true });
  return user;
}
