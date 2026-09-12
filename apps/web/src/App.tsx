import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity as ActivityIcon,
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCheck,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Users,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { mutate, request, signIn, signOut } from './api';
import { Avatar, Empty, ErrorNotice, Loading, relativeTime } from './components';
import { ProjectEditor } from './forms';
import { useSession } from './session';
import { labels, type Notification } from './types';

import { ActivityPage } from './pages/Activity';
import { Management } from './pages/Management';
import { Overview } from './pages/Overview';
import { ProjectPage, Projects } from './pages/Projects';
import { TasksPage } from './pages/Tasks';
import { TaskDetails } from './TaskDetails';

export default function App() {
  const { user, loading } = useSession();
  if (loading) return <Loading />;
  return user ? <Workspace /> : <Login />;
}
function Login() {
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await signIn(String(data.get('email')), String(data.get('password')));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">f</span>fieldwork<span className="brand-dot">.</span>
        </div>
        <div className="login-statement">
          <span className="eyebrow">THE AGENCY WORKSPACE</span>
          <h1>
            Good work.
            <br />
            Moving forward.
          </h1>
          <p>
            A shared place for client projects,
            <br />
            daily priorities, and the details in between.
          </p>
          <div className="login-lines">
            <div>
              <span>01</span>Keep the work in view
            </div>
            <div>
              <span>02</span>Make the next step clear
            </div>
            <div>
              <span>03</span>Stay in sync with your team
            </div>
          </div>
        </div>
        <span className="login-footer">Projects, people, progress.</span>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={submit} className="login-form">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Use the account provided by your administrator.</p>
          <ErrorNotice error={error} />
          <label className="field">
            <span>Email address</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <div className="password-input">
              <input
                name="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <button className="button login-submit" disabled={busy}>
            {busy ? (
              'Signing in…'
            ) : (
              <>
                Sign in
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="login-help">Need access? Contact your workspace administrator.</p>
        </form>
      </section>
    </main>
  );
}
function Workspace() {
  const { user, connected } = useSession();
  const [menu, setMenu] = useState(false),
    [taskId, setTaskId] = useState<number | null>(null),
    [newProject, setNewProject] = useState(false);
  const location = useLocation();
  useEffect(() => setMenu(false), [location.pathname]);
  const closeTask = useCallback(() => setTaskId(null), []);
  const closeProject = useCallback(() => setNewProject(false), []);
  const navigation = [
    { path: '/', label: 'Overview', icon: LayoutDashboard },
    { path: '/projects', label: 'Projects', icon: FolderKanban },
    {
      path: '/tasks',
      label: user!.role === 'DEVELOPER' ? 'My tasks' : 'All tasks',
      icon: ListTodo,
    },
    { path: '/activity', label: 'Activity', icon: ActivityIcon },
  ];
  const title = location.pathname.startsWith('/projects')
    ? 'Projects'
    : navigation.find((n) => n.path === location.pathname)?.label ||
      { '/clients': 'Clients', '/team': 'Team' }[location.pathname] ||
      'Workspace';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {menu && (
        <button
          className="sidebar-scrim"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link to="/" className="brand">
          <span className="brand-mark">f</span>fieldwork<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-icon">W</span>
          <div>
            <strong>Agency workspace</strong>
            <span>Client operations</span>
          </div>
        </div>
        <span className="nav-heading">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === '/'}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
          {user!.role === 'ADMIN' && (
            <>
              <span className="nav-heading admin-heading">MANAGEMENT</span>
              <NavLink to="/clients">
                <Building2 size={19} />
                Clients
              </NavLink>
              <NavLink to="/team">
                <Users size={19} />
                Team
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className={`connection ${connected ? 'online' : ''}`}>
            <i />
            {connected ? 'Live updates connected' : 'Reconnecting to live updates'}
          </div>
          <div className="user-block">
            <Avatar name={user!.name} />
            <div>
              <strong>{user!.name}</strong>
              <span>{labels[user!.role]}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Date().toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <Notifications onTask={setTaskId} />
            <Avatar name={user!.name} small />
          </div>
        </header>
        <main id="main" className="main-content">
          {!connected && (
            <div className="offline-banner">
              <WifiOff size={16} />
              Live updates are reconnecting. Saved data is still available.
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={<Overview onTask={setTaskId} onNewProject={() => setNewProject(true)} />}
            />
            <Route path="/projects" element={<Projects onNew={() => setNewProject(true)} />} />
            <Route path="/projects/:id" element={<ProjectPage onTask={setTaskId} />} />
            <Route path="/tasks" element={<TasksPage onTask={setTaskId} />} />
            <Route path="/activity" element={<ActivityPage onTask={setTaskId} />} />
            <Route
              path="/clients"
              element={
                user!.role === 'ADMIN' ? <Management kind="clients" /> : <Navigate to="/" replace />
              }
            />
            <Route
              path="/team"
              element={
                user!.role === 'ADMIN' ? <Management kind="users" /> : <Navigate to="/" replace />
              }
            />
            <Route
              path="*"
              element={
                <Empty title="Page not found">
                  <Link className="button" to="/">
                    Back to overview
                  </Link>
                </Empty>
              }
            />
          </Routes>
          <footer className="page-footer">
            <span>Fieldwork / Agency workspace</span>
            <span>One place. Everyone in sync.</span>
          </footer>
        </main>
      </div>
      {taskId !== null && <TaskDetails taskId={taskId} onClose={closeTask} />}{' '}
      {newProject && <ProjectEditor onClose={closeProject} />}
    </div>
  );
}
function Notifications({ onTask }: { onTask: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => request<{ items: Notification[]; unread: number }>('/notifications'),
  });
  const mutation = useMutation({
    mutationFn: (id?: string) =>
      mutate(id ? `/notifications/${id}/read` : '/notifications/read-all', 'PATCH', {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return (
    <div className="notifications">
      <button
        className={`icon-button notification-trigger ${open ? 'active' : ''}`}
        aria-label={`Notifications, ${query.data?.unread || 0} unread`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} />
        {!!query.data?.unread && (
          <span className="notification-count">
            {query.data.unread > 99 ? '99+' : query.data.unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            className="dropdown-scrim"
            onClick={() => setOpen(false)}
            aria-label="Close notifications"
          />
          <section className="notification-panel" aria-label="Notifications">
            <div className="panel-heading">
              <h3>
                Notifications <span className="count-pill">{query.data?.unread || 0}</span>
              </h3>
              <button
                className="text-link"
                disabled={mutation.isPending || !query.data?.unread}
                onClick={() => mutation.mutate(undefined)}
              >
                <CheckCheck size={16} />
                Read all
              </button>
            </div>
            <ErrorNotice error={query.error || mutation.error} />
            {query.isPending ? (
              <Loading />
            ) : !query.data?.items.length ? (
              <Empty
                title="You're all caught up"
                detail="Task assignments and review requests appear here."
              />
            ) : (
              <ul>
                {query.data.items.map((n) => (
                  <li className={!n.read_at ? 'unread' : ''} key={n.id}>
                    <button
                      onClick={() => {
                        onTask(n.task_id);
                        setOpen(false);
                        if (!n.read_at) mutation.mutate(n.id);
                      }}
                    >
                      <p>{n.message}</p>
                      <time>{relativeTime(n.created_at)}</time>
                    </button>
                    {!n.read_at && (
                      <button
                        className="icon-button"
                        aria-label="Mark notification as read"
                        onClick={() => mutation.mutate(n.id)}
                      >
                        <Check size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
