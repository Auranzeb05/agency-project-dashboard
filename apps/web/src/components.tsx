import { ArrowUpRight, Inbox, LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Activity, Priority, Status, Task } from './types';
import { labels, statuses } from './types';
export function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}
export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return <span className={`avatar ${small ? 'small' : ''}`}>{initials(name)}</span>;
}
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <i />
      {labels[status]}
    </span>
  );
}
export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`priority priority-${priority.toLowerCase()}`}>
      <span className="priority-bars">
        <i />
        <i />
        <i />
        <i />
      </span>
      {labels[priority]}
    </span>
  );
}
export function dateLabel(date: string) {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
export function relativeTime(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  return minutes < 1
    ? 'just now'
    : minutes < 60
      ? `${minutes} min${minutes === 1 ? '' : 's'} ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} />
      <span>Loading workspace…</span>
    </div>
  );
}
export function Empty({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {children}
    </div>
  );
}
export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="error-notice">
      {error instanceof Error ? error.message : 'Unable to load this information.'}
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const close = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', close);
    return () => {
      dialog.removeEventListener('cancel', close);
      dialog.close();
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? 'wide' : ''}`}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function TaskTable({
  tasks,
  onOpen,
  onStatus,
  hideProject = false,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onStatus: (task: Task, status: Status) => void;
  hideProject?: boolean;
}) {
  if (!tasks.length)
    return (
      <Empty
        title="No tasks here yet"
        detail="Tasks matching your current view will appear here."
      />
    );
  return (
    <div className="table-scroll">
      <table className="task-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Due date</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <button className="task-title" onClick={() => onOpen(task)}>
                  <span className="task-number">#{String(task.id).padStart(2, '0')}</span>
                  {task.title}
                </button>
                {!hideProject && <span className="table-subtext">{task.project_name}</span>}
              </td>
              <td>
                <div className="status-select">
                  <StatusBadge status={task.status} />
                  <select
                    aria-label={`Status for ${task.title}`}
                    value={task.status}
                    disabled={task.archived}
                    onChange={(e) => onStatus(task, e.target.value as Status)}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {labels[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </td>
              <td>
                <PriorityBadge priority={task.priority} />
              </td>
              <td>
                <span className="assignee">
                  <Avatar name={task.assignee_name} small />
                  <span>{task.assignee_name.split(' ')[0]}</span>
                </span>
              </td>
              <td>
                <span className={task.overdue ? 'overdue-date' : ''}>
                  {dateLabel(task.due_date)}
                </span>
                {task.overdue && <span className="overdue-label">Overdue</span>}
              </td>
              <td>
                <button
                  className="icon-button"
                  onClick={() => onOpen(task)}
                  aria-label={`Open ${task.title}`}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ActivityList({
  items,
  compact = false,
  onTask,
}: {
  items: Activity[];
  compact?: boolean;
  onTask?: (id: number) => void;
}) {
  if (!items.length)
    return <Empty title="No activity yet" detail="Changes to your tasks will appear here." />;
  return (
    <ol className={`activity-list ${compact ? 'compact' : ''}`}>
      {items.map((event) => (
        <li key={event.id}>
          <Avatar name={event.actor_name} small />
          <div>
            <p>
              <strong>{event.actor_name}</strong>
              {event.kind === 'status' ? (
                <>
                  {' '}
                  moved{' '}
                  <button className="text-link" onClick={() => onTask?.(event.task_id)}>
                    Task #{event.task_id}
                  </button>{' '}
                  from {labels[event.old_value || ''] || event.old_value} →{' '}
                  <strong>{labels[event.new_value || ''] || event.new_value}</strong>
                </>
              ) : event.kind === 'created' ? (
                <>
                  {' '}
                  created{' '}
                  <button className="text-link" onClick={() => onTask?.(event.task_id)}>
                    {event.task_title}
                  </button>
                </>
              ) : event.kind === 'assigned' ? (
                <>
                  {' '}
                  assigned{' '}
                  <button className="text-link" onClick={() => onTask?.(event.task_id)}>
                    Task #{event.task_id}
                  </button>{' '}
                  to {event.new_value}
                </>
              ) : event.kind === 'overdue' ? (
                <>
                  {' '}
                  flagged{' '}
                  <button className="text-link" onClick={() => onTask?.(event.task_id)}>
                    Task #{event.task_id}
                  </button>{' '}
                  as overdue
                </>
              ) : (
                <>
                  {' '}
                  updated{' '}
                  <button className="text-link" onClick={() => onTask?.(event.task_id)}>
                    Task #{event.task_id}
                  </button>
                  {event.new_value && <> · {event.new_value.replaceAll('_', ' ')}</>}
                </>
              )}
            </p>
            <div className="activity-meta">
              <Link to={`/projects/${event.project_id}`}>{event.project_name.split(' — ')[0]}</Link>
              <span>·</span>
              <time dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>
                {relativeTime(event.created_at)}
              </time>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
