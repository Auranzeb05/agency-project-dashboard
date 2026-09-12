import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useCallback, useState } from 'react';
import { request } from './api';
import {
  ActivityList,
  Avatar,
  ErrorNotice,
  Loading,
  Modal,
  PriorityBadge,
  dateLabel,
} from './components';
import { TaskEditor } from './forms';
import { useSession } from './session';
import { labels, statuses, type Activity, type Status, type Task } from './types';

import { useStatusChange } from './pages/Tasks';

export function TaskDetails({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { user } = useSession(),
    client = useQueryClient();
  const [edit, setEdit] = useState(false);
  const closeEdit = useCallback(() => setEdit(false), []);
  const task = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => request<Task>(`/tasks/${taskId}`),
  });
  const activity = useQuery({
    queryKey: ['activity', 'task', taskId],
    queryFn: () => request<{ items: Activity[] }>(`/activity?task_id=${taskId}`),
  });
  const update = useStatusChange();
  if (edit && task.data)
    return <TaskEditor projectId={task.data.project_id} task={task.data} onClose={closeEdit} />;
  return (
    <Modal title={`Task #${taskId}`} onClose={onClose} wide>
      <ErrorNotice
        error={task.error || update.error}
        retry={task.error ? () => void task.refetch() : undefined}
      />
      {task.isPending ? (
        <Loading />
      ) : (
        task.data && (
          <>
            <div className="task-detail-heading">
              <span className="eyebrow">{task.data.project_name}</span>
              <h2>{task.data.title}</h2>
            </div>
            <p className="task-description">{task.data.description || 'No description added.'}</p>
            <div className="task-details-grid">
              <div>
                <span>Assignee</span>
                <strong>
                  <Avatar name={task.data.assignee_name} small />
                  {task.data.assignee_name}
                </strong>
              </div>
              <div>
                <span>Priority</span>
                <PriorityBadge priority={task.data.priority} />
              </div>
              <div>
                <span>Due date</span>
                <strong className={task.data.overdue ? 'overdue-text' : ''}>
                  {dateLabel(task.data.due_date)}
                  {task.data.overdue ? ' · Overdue' : ''}
                </strong>
              </div>
              <label>
                <span>Status</span>
                <select
                  value={task.data.status}
                  disabled={task.data.archived || update.isPending}
                  onChange={(e) =>
                    update.mutate({ task: task.data, status: e.target.value as Status })
                  }
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {user!.role !== 'DEVELOPER' && (
              <button
                className="button secondary"
                onClick={() => setEdit(true)}
                disabled={task.data.archived}
              >
                <Pencil size={15} />
                Edit task
              </button>
            )}
            <div className="task-history">
              <h3>Activity history</h3>
              <ErrorNotice error={activity.error} />
              {activity.isPending ? (
                <Loading />
              ) : (
                activity.data && <ActivityList items={activity.data.items} />
              )}
            </div>
          </>
        )
      )}
    </Modal>
  );
}
