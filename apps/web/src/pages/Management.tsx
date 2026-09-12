import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { request } from '../api';
import { Avatar, Empty, ErrorNotice, Loading } from '../components';
import { ClientEditor, UserEditor } from '../forms';
import { labels, type Client, type User } from '../types';

import { PageHeading } from '../PageHeading';

export function Management({ kind }: { kind: 'clients' | 'users' }) {
  const [editing, setEditing] = useState<User | Client | 'new' | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const query = useQuery({
    queryKey: [kind],
    queryFn: () => request<{ items: (User | Client)[] }>(`/${kind}`),
  });
  const isUsers = kind === 'users';
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE MANAGEMENT"
        title={isUsers ? 'Team' : 'Clients'}
        description={
          isUsers
            ? 'Manage accounts and the roles behind the work.'
            : 'The people and companies you build for.'
        }
      >
        <button className="button" onClick={() => setEditing('new')}>
          <Plus size={18} />
          {isUsers ? 'Add team member' : 'New client'}
        </button>
      </PageHeading>
      <section className="panel">
        <ErrorNotice error={query.error} />
        {query.isPending ? (
          <Loading />
        ) : query.data?.items.length ? (
          <div className="table-scroll">
            <table className="management-table">
              <thead>
                <tr>
                  <th>{isUsers ? 'Team member' : 'Client'}</th>
                  <th>Email</th>
                  <th>{isUsers ? 'Role' : 'Company'}</th>
                  {isUsers && <th>Status</th>}
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="assignee">
                        <Avatar name={item.name} />
                        <strong>{item.name}</strong>
                      </span>
                    </td>
                    <td>{item.email}</td>
                    <td>{'role' in item ? labels[item.role] : item.company || '—'}</td>
                    {'active' in item && (
                      <td>
                        <span className={`account-state ${item.active ? '' : 'inactive'}`}>
                          {item.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    )}
                    <td>
                      <button
                        className="button secondary small-button"
                        onClick={() => setEditing(item)}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={isUsers ? 'No team members yet' : 'No clients yet'}
            detail={
              isUsers
                ? 'Add a team member to start assigning work.'
                : 'Add a client before creating a project.'
            }
          />
        )}
      </section>
      {editing &&
        (isUsers ? (
          <UserEditor user={editing === 'new' ? undefined : (editing as User)} onClose={close} />
        ) : (
          <ClientEditor
            client={editing === 'new' ? undefined : (editing as Client)}
            onClose={close}
          />
        ))}
    </>
  );
}
