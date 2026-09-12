import { z } from 'zod';
import { priorities, roles, statuses } from './model.js';
const text = z.string().trim().min(1).max(160);
const date = z.iso.date();
export const id = z.coerce.number().int().positive().max(2147483647);
export const loginInput = z
  .object({ email: z.email().toLowerCase(), password: z.string().min(1).max(128) })
  .strict();
export const userInput = z
  .object({
    name: text,
    email: z.email().toLowerCase(),
    role: z.enum(roles),
    password: z.string().min(12).max(72),
  })
  .strict();
export const userEdit = userInput
  .omit({ password: true })
  .partial()
  .extend({ active: z.boolean().optional(), password: z.string().min(12).max(72).optional() })
  .strict();
export const clientInput = z
  .object({ name: text, email: z.email(), company: z.string().trim().max(160).default('') })
  .strict();
export const projectInput = z
  .object({ name: text, description: z.string().trim().max(4000).default(''), client_id: id })
  .strict();
export const projectEdit = projectInput
  .partial()
  .extend({ archived: z.boolean().optional() })
  .strict();
export const taskInput = z
  .object({
    title: text,
    description: z.string().trim().max(6000).default(''),
    assigned_to: z.uuid(),
    status: z.enum(statuses).default('TODO'),
    priority: z.enum(priorities).default('MEDIUM'),
    due_date: date,
  })
  .strict();
export const taskEdit = taskInput.partial().extend({ version: id }).strict();
export const statusInput = z.object({ status: z.enum(statuses), version: id }).strict();
export const filters = z
  .object({
    project_id: id.optional(),
    status: z.enum(statuses).optional(),
    priority: z.enum(priorities).optional(),
    due_from: date.optional(),
    due_to: date.optional(),
    page: z.coerce.number().int().positive().max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict()
  .refine((x) => !x.due_from || !x.due_to || x.due_from <= x.due_to, {
    message: 'Start date must be on or before end date.',
  });
export const activityFilters = z
  .object({
    project_id: id.optional(),
    task_id: id.optional(),
    after: z
      .string()
      .regex(/^\d{1,18}$/)
      .optional(),
  })
  .strict();
