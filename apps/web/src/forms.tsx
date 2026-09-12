import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { mutate, request } from './api';
import { ErrorNotice, Loading, Modal } from './components';
import {
  labels,
  priorities,
  statuses,
  type Client,
  type Project,
  type Task,
  type User,
} from './types';

type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  minLength?: number;
};
export function Editor({
  title,
  fields,
  onSave,
  onClose,
  children,
}: {
  title: string;
  fields: Field[];
  onSave: (values: Record<string, string>) => Promise<unknown>;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const queryClient = useQueryClient();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<
        string,
        string
      >;
      await onSave(values);
      await queryClient.invalidateQueries();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="editor">
        <ErrorNotice error={error} />
        {fields.map((field) => (
          <label key={field.name} className="field">
            <span>{field.label}</span>
            {field.options ? (
              <select
                name={field.name}
                defaultValue={field.defaultValue || ''}
                required={field.required !== false}
              >
                {!field.defaultValue && (
                  <option value="" disabled>
                    Select {field.label.toLowerCase()}
                  </option>
                )}
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                name={field.name}
                defaultValue={field.defaultValue}
                rows={4}
                maxLength={6000}
              />
            ) : (
              <input
                name={field.name}
                type={field.type || 'text'}
                defaultValue={field.defaultValue}
                placeholder={field.placeholder}
                required={field.required !== false}
                minLength={field.minLength}
                maxLength={field.type === 'password' ? 72 : 160}
              />
            )}
          </label>
        ))}
        {children}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? (
              'Saving…'
            ) : (
              <>
                <Check size={16} />
                Save changes
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ProjectEditor({ project, onClose }: { project?: Project; onClose: () => void }) {
  const clients = useQuery({
    queryKey: ['clients'],
    queryFn: () => request<{ items: Client[] }>('/clients'),
  });
  if (clients.isPending)
    return (
      <Modal title="Project" onClose={onClose}>
        <Loading />
      </Modal>
    );
  if (clients.error)
    return (
      <Modal title="Project" onClose={onClose}>
        <ErrorNotice error={clients.error} />
      </Modal>
    );
  return (
    <Editor
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      fields={[
        { name: 'name', label: 'Project name', defaultValue: project?.name },
        {
          name: 'client_id',
          label: 'Client',
          defaultValue: project?.client_id.toString(),
          options: clients.data.items.map((c) => ({ value: String(c.id), label: c.name })),
        },
        {
          name: 'description',
          label: 'Project brief',
          type: 'textarea',
          required: false,
          defaultValue: project?.description,
        },
      ]}
      onSave={(v) =>
        mutate(project ? `/projects/${project.id}` : '/projects', project ? 'PATCH' : 'POST', {
          ...v,
          client_id: Number(v.client_id),
        })
      }
    >
      {!clients.data.items.length && (
        <p className="muted">
          An administrator needs to add a client before you can create a project.
        </p>
      )}
    </Editor>
  );
}
export function TaskEditor({
  projectId,
  task,
  onClose,
}: {
  projectId: number;
  task?: Task;
  onClose: () => void;
}) {
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => request<{ items: (User | { id: string; name: string })[] }>('/users'),
  });
  if (users.isPending)
    return (
      <Modal title="Task" onClose={onClose}>
        <Loading />
      </Modal>
    );
  if (users.error)
    return (
      <Modal title="Task" onClose={onClose}>
        <ErrorNotice error={users.error} />
      </Modal>
    );
  const developers = users.data.items.filter(
    (u) => !('role' in u) || (u.role === 'DEVELOPER' && u.active),
  );
  return (
    <Editor
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      fields={[
        { name: 'title', label: 'Task title', defaultValue: task?.title },
        {
          name: 'description',
          label: 'Description',
          type: 'textarea',
          required: false,
          defaultValue: task?.description,
        },
        {
          name: 'assigned_to',
          label: 'Assign to',
          defaultValue: task?.assigned_to,
          options: developers.map((u) => ({ value: u.id, label: u.name })),
        },
        {
          name: 'status',
          label: 'Status',
          defaultValue: task?.status || 'TODO',
          options: statuses.map((s) => ({ value: s, label: labels[s] })),
        },
        {
          name: 'priority',
          label: 'Priority',
          defaultValue: task?.priority || 'MEDIUM',
          options: priorities.map((p) => ({ value: p, label: labels[p] })),
        },
        {
          name: 'due_date',
          label: 'Due date (UTC)',
          type: 'date',
          defaultValue: task?.due_date?.slice(0, 10),
        },
      ]}
      onSave={(v) =>
        mutate(
          task ? `/tasks/${task.id}` : `/projects/${projectId}/tasks`,
          task ? 'PATCH' : 'POST',
          { ...v, ...(task ? { version: task.version } : {}) },
        )
      }
    />
  );
}
export function ClientEditor({ client, onClose }: { client?: Client; onClose: () => void }) {
  return (
    <Editor
      title={client ? 'Edit client' : 'New client'}
      onClose={onClose}
      fields={[
        { name: 'name', label: 'Client name', defaultValue: client?.name },
        { name: 'company', label: 'Company', defaultValue: client?.company, required: false },
        { name: 'email', label: 'Contact email', type: 'email', defaultValue: client?.email },
      ]}
      onSave={(v) =>
        mutate(client ? `/clients/${client.id}` : '/clients', client ? 'PUT' : 'POST', v)
      }
    />
  );
}
export function UserEditor({ user, onClose }: { user?: User; onClose: () => void }) {
  return (
    <Editor
      title={user ? 'Edit team member' : 'New team member'}
      onClose={onClose}
      fields={[
        { name: 'name', label: 'Full name', defaultValue: user?.name },
        { name: 'email', label: 'Email', type: 'email', defaultValue: user?.email },
        {
          name: 'role',
          label: 'Role',
          defaultValue: user?.role || 'DEVELOPER',
          options: ['ADMIN', 'PM', 'DEVELOPER'].map((r) => ({ value: r, label: labels[r] })),
        },
        {
          name: 'password',
          label: user ? 'New password (leave blank to keep)' : 'Password (at least 12 characters)',
          type: 'password',
          minLength: 12,
          required: !user,
        },
        ...(user
          ? [
              {
                name: 'active',
                label: 'Account status',
                defaultValue: String(user.active),
                options: [
                  { value: 'true', label: 'Active' },
                  { value: 'false', label: 'Inactive' },
                ],
              },
            ]
          : []),
      ]}
      onSave={(v) => {
        const { password, active, ...rest } = v;
        return mutate(user ? `/users/${user.id}` : '/users', user ? 'PATCH' : 'POST', {
          ...rest,
          ...(password ? { password } : {}),
          ...(user ? { active: active === 'true' } : {}),
        });
      }}
    />
  );
}
