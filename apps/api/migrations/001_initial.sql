CREATE TYPE user_role AS ENUM ('ADMIN', 'PM', 'DEVELOPER');
CREATE TYPE task_status AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE');
CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE,
 password_hash text NOT NULL, role user_role NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK (email = lower(email))
);
CREATE TABLE clients (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, email text NOT NULL,
 company text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE projects (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
 client_id integer NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tasks (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id integer NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 title text NOT NULL, description text NOT NULL DEFAULT '',
 assigned_to uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status task_status NOT NULL DEFAULT 'TODO', priority task_priority NOT NULL DEFAULT 'MEDIUM',
 due_date date NOT NULL, overdue boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE activities (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id integer NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
 actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('created','status','updated','assigned','overdue')),
 old_value text, new_value text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id integer NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 message text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refresh_tokens (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, used_at timestamptz, expires_at timestamptz NOT NULL
);
CREATE INDEX projects_owner_idx ON projects(created_by);
CREATE INDEX projects_client_idx ON projects(client_id);
CREATE INDEX tasks_project_status_idx ON tasks(project_id, status);
CREATE INDEX tasks_assignee_priority_due_idx ON tasks(assigned_to, priority DESC, due_date);
CREATE INDEX tasks_due_open_idx ON tasks(due_date) WHERE status <> 'DONE';
CREATE INDEX tasks_priority_idx ON tasks(priority);
CREATE INDEX activities_task_cursor_idx ON activities(task_id, id DESC);
CREATE INDEX notifications_user_recent_idx ON notifications(user_id, id DESC);
CREATE INDEX notifications_unread_idx ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX refresh_session_idx ON refresh_tokens(session_id);
