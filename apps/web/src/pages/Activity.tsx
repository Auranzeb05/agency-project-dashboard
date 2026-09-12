import { useQuery } from '@tanstack/react-query';
import { request } from '../api';
import { ActivityList, ErrorNotice, Loading } from '../components';
import { useSession } from '../session';
import { type Activity } from '../types';

import { PageHeading } from '../PageHeading';

export function ActivityPage({ onTask }: { onTask: (id: number) => void }) {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ['activity'],
    queryFn: () => request<{ items: Activity[] }>('/activity'),
  });
  return (
    <>
      <PageHeading
        eyebrow="TEAM UPDATES"
        title="Activity"
        description={
          user!.role === 'ADMIN'
            ? 'The latest 20 events across all projects.'
            : user!.role === 'PM'
              ? 'The latest 20 events from the projects you manage.'
              : 'The latest 20 events on your assigned tasks.'
        }
      >
        <span className="live-tag">
          <i />
          Live updates
        </span>
      </PageHeading>
      <section className="panel full-activity">
        <ErrorNotice error={query.error} />
        {query.isPending ? (
          <Loading />
        ) : (
          query.data && <ActivityList items={query.data.items} onTask={onTask} />
        )}
      </section>
    </>
  );
}
