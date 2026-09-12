import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { mutate, request } from '../api';
import { ErrorNotice, Loading, TaskTable } from '../components';
import { useSession } from '../session';
import { labels, priorities, statuses, type Status, type Task, type TaskList } from '../types';

import { PageHeading } from '../PageHeading';

function Filters() {
  const [params, setParams] = useSearchParams();
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  const active = ['status', 'priority', 'due_from', 'due_to'].some((key) => params.has(key));
  return (
    <div className="filter-bar">
      <span className="filter-label">
        <SlidersHorizontal size={16} />
        Filters
      </span>
      <label>
        <span className="sr-only">Filter status</span>
        <select
          value={params.get('status') || ''}
          onChange={(e) => update('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Filter priority</span>
        <select
          value={params.get('priority') || ''}
          onChange={(e) => update('priority', e.target.value)}
        >
          <option value="">All priorities</option>
          {priorities.map((p) => (
            <option key={p} value={p}>
              {labels[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="date-filter">
        <span>From</span>
        <input
          type="date"
          aria-label="Due date from"
          value={params.get('due_from') || ''}
          onChange={(e) => update('due_from', e.target.value)}
        />
      </label>
      <label className="date-filter">
        <span>To</span>
        <input
          type="date"
          aria-label="Due date to"
          value={params.get('due_to') || ''}
          onChange={(e) => update('due_to', e.target.value)}
        />
      </label>
      {active && (
        <button
          className="text-link"
          onClick={() => {
            const next = new URLSearchParams(params);
            ['status', 'priority', 'due_from', 'due_to', 'page'].forEach((k) => next.delete(k));
            setParams(next);
          }}
        >
          Clear
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function TaskListView({
  projectId,
  onTask,
}: {
  projectId?: number;
  onTask: (id: number) => void;
}) {
  const [params, setParams] = useSearchParams();
  const queryParams = new URLSearchParams();
  for (const key of ['status', 'priority', 'due_from', 'due_to', 'page'])
    if (params.has(key)) queryParams.set(key, params.get(key)!);
  if (projectId) queryParams.set('project_id', String(projectId));
  const query = useQuery({
      queryKey: ['tasks', queryParams.toString()],
      queryFn: () => request<TaskList>(`/tasks?${queryParams}`),
    }),
    update = useStatusChange();
  return (
    <section className="panel">
      <Filters />
      <ErrorNotice
        error={query.error || update.error}
        retry={query.error ? () => void query.refetch() : undefined}
      />
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && (
          <>
            <TaskTable
              tasks={query.data.items}
              onOpen={(t) => onTask(t.id)}
              onStatus={(task, status) => update.mutate({ task, status })}
              hideProject={!!projectId}
            />
            <div className="pagination">
              <span>
                {query.data.total} {query.data.total === 1 ? 'task' : 'tasks'}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous page"
                  disabled={query.data.page <= 1}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('page', String(query.data.page - 1));
                    setParams(next);
                  }}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  Page {query.data.page} of{' '}
                  {Math.max(1, Math.ceil(query.data.total / query.data.limit))}
                </span>
                <button
                  className="icon-button"
                  aria-label="Next page"
                  disabled={query.data.page * query.data.limit >= query.data.total}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('page', String(query.data.page + 1));
                    setParams(next);
                  }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )
      )}
    </section>
  );
}
export function TasksPage({ onTask }: { onTask: (id: number) => void }) {
  const { user } = useSession();
  return (
    <>
      <PageHeading
        eyebrow="DAILY PRIORITIES"
        title={user!.role === 'DEVELOPER' ? 'My tasks' : 'All tasks'}
        description="Keep the next step clear. Filter this view and share its URL."
      />
      <TaskListView onTask={onTask} />
    </>
  );
}
export function useStatusChange() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ task, status }: { task: Task; status: Status }) =>
      mutate(`/tasks/${task.id}/status`, 'PATCH', { status, version: task.version }),
    onSuccess: () => client.invalidateQueries(),
    onError: () => client.invalidateQueries(),
  });
}
