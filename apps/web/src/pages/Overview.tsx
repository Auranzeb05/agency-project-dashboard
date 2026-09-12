import { useQuery } from '@tanstack/react-query';
import {
  Activity as ActivityIcon,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  FolderKanban,
  ListTodo,
  Plus,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { request } from '../api';
import { ActivityList, ErrorNotice, Loading, PriorityBadge, TaskTable } from '../components';
import { useSession } from '../session';
import { priorities, type Activity, type Dashboard, type Project, type TaskList } from '../types';

import { PageHeading } from '../PageHeading';
import { useStatusChange } from './Tasks';

export function Overview({
  onTask,
  onNewProject,
}: {
  onTask: (id: number) => void;
  onNewProject: () => void;
}) {
  const { user, online } = useSession(),
    role = user!.role;
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => request<Dashboard>('/dashboard'),
  });
  const tasks = useQuery({
    queryKey: ['tasks', 'overview'],
    queryFn: () => request<TaskList>('/tasks?limit=6'),
  });
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => request<{ items: Activity[] }>('/activity'),
  });
  const update = useStatusChange();
  if (dashboard.isPending) return <Loading />;
  if (dashboard.error)
    return <ErrorNotice error={dashboard.error} retry={() => void dashboard.refetch()} />;
  const data = dashboard.data,
    counts = data.counts;
  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 17
        ? 'Good afternoon'
        : 'Good evening';
  const stages = [
    { label: 'To do', value: counts.todo, key: 'todo' },
    { label: 'In progress', value: counts.in_progress, key: 'in_progress' },
    { label: 'In review', value: counts.in_review, key: 'in_review' },
    { label: 'Done', value: counts.done, key: 'done' },
  ];
  return (
    <>
      <PageHeading
        eyebrow={
          role === 'ADMIN'
            ? 'WORKSPACE OVERVIEW'
            : role === 'PM'
              ? 'YOUR PROJECTS'
              : 'YOUR WORKSPACE'
        }
        title={`${greeting}, ${user!.name.split(' ')[0]}.`}
        description={
          role === 'ADMIN'
            ? "Here's where the team's work stands."
            : role === 'PM'
              ? "A clear view of your projects and what's coming next."
              : 'Your priorities, progress, and next steps.'
        }
      >
        {role !== 'DEVELOPER' && (
          <button className="button" onClick={onNewProject}>
            <Plus size={18} />
            New project
          </button>
        )}
      </PageHeading>
      <div className="stats-grid">
        <Stat
          title={role === 'DEVELOPER' ? 'Assigned tasks' : 'Total projects'}
          value={role === 'DEVELOPER' ? counts.total_tasks : data.total_projects}
          detail={role === 'DEVELOPER' ? 'Across your projects' : 'In your workspace'}
          icon={<FolderKanban size={19} />}
        />
        <Stat
          title="In progress"
          value={counts.in_progress}
          detail="Moving forward"
          icon={<ActivityIcon size={19} />}
        />
        <Stat
          title="Overdue tasks"
          value={counts.overdue}
          detail={counts.overdue ? 'Need a little attention' : 'All due dates on track'}
          alert={counts.overdue > 0}
          icon={<ListTodo size={19} />}
        />
        <Stat
          title={role === 'ADMIN' ? 'Online now' : 'Completed tasks'}
          value={role === 'ADMIN' ? online : counts.done}
          detail={role === 'ADMIN' ? 'Unique team members' : 'Ready and delivered'}
          icon={role === 'ADMIN' ? <Users size={19} /> : <CheckCheck size={19} />}
          live={role === 'ADMIN'}
        />
      </div>
      <div className="overview-grid">
        <div className="overview-main">
          <section className="panel progress-panel">
            <div className="panel-heading">
              <div>
                <h2>{role === 'PM' ? 'Tasks by priority' : 'Work in motion'}</h2>
                <p>
                  {role === 'PM'
                    ? 'Focus your team on what matters next.'
                    : `${counts.total_tasks} tasks across ${data.total_projects} projects`}
                </p>
              </div>
              <Link className="text-link" to="/tasks">
                View tasks
                <ArrowUpRight size={15} />
              </Link>
            </div>
            {role === 'PM' ? (
              <div className="priority-chart">
                {priorities.map((priority) => {
                  const count = data.priority.find((p) => p.priority === priority)?.count || 0;
                  return (
                    <div key={priority}>
                      <PriorityBadge priority={priority} />
                      <div className="priority-track">
                        <i
                          style={{ width: `${(count / Math.max(1, counts.total_tasks)) * 100}%` }}
                          className={`fill-${priority.toLowerCase()}`}
                        />
                      </div>
                      <strong>{count}</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="progress-chart" aria-label="Task status distribution">
                  {stages.map((s) => (
                    <div
                      key={s.key}
                      className={`segment segment-${s.key}`}
                      style={{ flex: s.value || 0.08 }}
                      title={`${s.label}: ${s.value}`}
                    />
                  ))}
                </div>
                <div className="status-legend">
                  {stages.map((s) => (
                    <Link to={`/tasks?status=${s.key.toUpperCase()}`} key={s.key}>
                      <i className={`legend-${s.key}`} />
                      <span>{s.label}</span>
                      <strong>{s.value}</strong>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{role === 'DEVELOPER' ? 'Your next priorities' : 'Priority tasks'}</h2>
                <p>Ordered by priority, then due date.</p>
              </div>
              <Link className="text-link" to="/tasks">
                View all
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <ErrorNotice error={tasks.error || update.error} />
            {tasks.isPending ? (
              <Loading />
            ) : (
              tasks.data && (
                <TaskTable
                  tasks={tasks.data.items}
                  onOpen={(t) => onTask(t.id)}
                  onStatus={(task, status) => update.mutate({ task, status })}
                />
              )
            )}
          </section>
          <section className="project-section">
            <div className="section-heading">
              <h2>{role === 'PM' ? 'Your projects' : 'Project pulse'}</h2>
              <Link to="/projects" className="text-link">
                All projects
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="project-mini-grid">
              {data.projects.slice(0, 3).map((p, i) => (
                <ProjectCard key={p.id} project={p} index={i} compact />
              ))}
            </div>
          </section>
          {role === 'PM' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Due this week</h2>
                <span className="count-pill">{data.upcoming.length}</span>
              </div>
              <TaskTable
                tasks={data.upcoming}
                onOpen={(t) => onTask(t.id)}
                onStatus={(task, status) => update.mutate({ task, status })}
              />
            </section>
          )}
        </div>
        <aside className="activity-panel">
          <div className="section-heading">
            <h2>Latest activity</h2>
            <span className="live-tag">
              <i />
              Live
            </span>
          </div>
          <p className="activity-intro">
            {role === 'ADMIN'
              ? 'Updates from across the workspace.'
              : role === 'PM'
                ? 'The latest from your projects.'
                : 'Changes to your assigned tasks.'}
          </p>
          <ErrorNotice error={activity.error} />
          {activity.isPending ? (
            <Loading />
          ) : (
            activity.data && (
              <ActivityList items={activity.data.items.slice(0, 8)} compact onTask={onTask} />
            )
          )}
          <Link className="activity-more" to="/activity">
            Open activity feed
            <ArrowRight size={17} />
          </Link>
          <div className="review-note">
            <span className="eyebrow">READY FOR THE NEXT STEP</span>
            <strong>
              {counts.in_review} {counts.in_review === 1 ? 'task is' : 'tasks are'} in review.
            </strong>
            <Link to="/tasks?status=IN_REVIEW">
              Take a look
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
function Stat({
  title,
  value,
  detail,
  icon,
  alert = false,
  live = false,
}: {
  title: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  alert?: boolean;
  live?: boolean;
}) {
  return (
    <section className={`stat ${alert ? 'attention' : ''}`}>
      <div className="stat-top">
        <span>{title}</span>
        {icon}
      </div>
      <div className="stat-value">
        {String(value).padStart(2, '0')}
        {live && <i className="live-dot" />}
      </div>
      <p>{detail}</p>
    </section>
  );
}
export function ProjectCard({
  project: p,
  index,
  compact = false,
}: {
  project: Project;
  index: number;
  compact?: boolean;
}) {
  const percent = Math.round((p.done_count / Math.max(1, p.task_count)) * 100);
  return (
    <Link to={`/projects/${p.id}`} className={`project-card ${compact ? 'compact' : ''}`}>
      <div className="project-card-top">
        <span className={`project-symbol color-${index % 3}`}>{p.name.slice(0, 1)}</span>
        <ArrowUpRight size={18} />
      </div>
      <span className="project-client">{p.client_name || 'PROJECT'}</span>
      <h3>{p.name}</h3>
      {!compact && (
        <p className="project-brief">
          {p.description || 'Keep track of this project’s tasks and progress.'}
        </p>
      )}
      <div className="project-progress-label">
        <span>
          {p.done_count} of {p.task_count} tasks
        </span>
        <strong>{percent}%</strong>
      </div>
      <div className="project-track">
        <i style={{ width: `${percent}%` }} />
      </div>
      {!compact && (
        <div className="project-card-footer">
          <span>{p.owner_name || 'Assigned work'}</span>
          <span className={p.overdue_count ? 'overdue-text' : 'muted'}>
            {p.archived ? 'Archived' : p.overdue_count ? `${p.overdue_count} overdue` : 'On track'}
          </span>
        </div>
      )}
    </Link>
  );
}
