import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronLeft, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { mutate, request } from '../api';
import { ActivityList, Avatar, Empty, ErrorNotice, Loading } from '../components';
import { ProjectEditor, TaskEditor } from '../forms';
import { useSession } from '../session';
import { type Activity, type Project } from '../types';

import { PageHeading } from '../PageHeading';
import { ProjectCard } from './Overview';
import { TaskListView } from './Tasks';

export function Projects({ onNew }: { onNew: () => void }) {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: () => request<{ items: Project[] }>('/projects'),
  });
  return (
    <>
      <PageHeading
        eyebrow="CLIENT WORK"
        title="Projects"
        description={
          user!.role === 'DEVELOPER'
            ? 'Projects with tasks assigned to you.'
            : 'The big picture, with every detail close by.'
        }
      >
        {user!.role !== 'DEVELOPER' && (
          <button className="button" onClick={onNew}>
            <Plus size={18} />
            New project
          </button>
        )}
      </PageHeading>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : query.data?.items.length ? (
        <div className="project-grid">
          {query.data.items.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </div>
      ) : (
        <Empty
          title="Your projects start here"
          detail="Projects you can access will appear in this workspace."
        />
      )}
    </>
  );
}
export function ProjectPage({ onTask }: { onTask: (id: number) => void }) {
  const { id } = useParams(),
    projectId = Number(id);
  const { user } = useSession();
  const client = useQueryClient();
  const [edit, setEdit] = useState(false),
    [newTask, setNewTask] = useState(false);
  const closeEdit = useCallback(() => setEdit(false), []),
    closeTask = useCallback(() => setNewTask(false), []);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => request<{ items: Project[] }>('/projects'),
  });
  const activity = useQuery({
    queryKey: ['activity', projectId],
    queryFn: () => request<{ items: Activity[] }>(`/activity?project_id=${projectId}`),
    enabled: Number.isInteger(projectId) && projectId > 0,
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => mutate(`/projects/${projectId}`, 'PATCH', { archived }),
    onSuccess: () => client.invalidateQueries(),
  });
  if (projects.isPending) return <Loading />;
  if (projects.error) return <ErrorNotice error={projects.error} />;
  const project = projects.data.items.find((p) => p.id === projectId);
  if (!project)
    return (
      <Empty title="Project unavailable" detail="This project may not be in your workspace." />
    );
  return (
    <>
      <Link to="/projects" className="back-link">
        <ChevronLeft size={16} />
        All projects
      </Link>
      <PageHeading
        eyebrow={project.client_name || 'PROJECT'}
        title={project.name}
        description={project.description}
      >
        {user!.role !== 'DEVELOPER' && (
          <>
            <button className="button secondary" onClick={() => setEdit(true)}>
              <Pencil size={16} />
              Edit project
            </button>
            <button className="button" disabled={project.archived} onClick={() => setNewTask(true)}>
              <Plus size={17} />
              New task
            </button>
          </>
        )}
      </PageHeading>
      <div className="project-summary">
        <span>
          <strong>{project.task_count}</strong> tasks
        </span>
        <span>
          <strong>{project.done_count}</strong> complete
        </span>
        <span className={project.overdue_count ? 'overdue-text' : ''}>
          <strong>{project.overdue_count}</strong> overdue
        </span>
        {project.owner_name && (
          <span className="project-owner">
            <Avatar name={project.owner_name} small />
            {project.owner_name}
          </span>
        )}
        {user!.role !== 'DEVELOPER' && (
          <button
            className="text-link"
            disabled={archive.isPending}
            onClick={() => archive.mutate(!project.archived)}
          >
            {project.archived ? <RotateCcw size={15} /> : <Archive size={15} />}{' '}
            {project.archived ? 'Restore project' : 'Archive project'}
          </button>
        )}
      </div>
      {project.archived && (
        <div className="info-notice">This project is archived. Restore it to change tasks.</div>
      )}
      <ErrorNotice error={archive.error} />
      <TaskListView projectId={projectId} onTask={onTask} />
      <section className="panel project-activity">
        <div className="panel-heading">
          <h2>Project activity</h2>
          <span className="live-tag">
            <i />
            Live
          </span>
        </div>
        <ErrorNotice error={activity.error} />
        {activity.isPending ? (
          <Loading />
        ) : (
          activity.data && <ActivityList items={activity.data.items} onTask={onTask} />
        )}
      </section>
      {edit && <ProjectEditor project={project} onClose={closeEdit} />}{' '}
      {newTask && <TaskEditor projectId={projectId} onClose={closeTask} />}
    </>
  );
}
