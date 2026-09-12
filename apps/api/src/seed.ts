import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.js';
import { priorities, statuses } from './model.js';
import { addActivity, addNotification } from './repository.js';
export async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12 || password.includes('GENERATE'))
    throw new Error('Set SEED_PASSWORD to at least 12 characters before seeding.');
  const hash = await bcrypt.hash(password, 12);
  return transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(812734)');
    if ((await db.query('SELECT 1 FROM users LIMIT 1')).rowCount) {
      console.log('Database already contains users; seed left existing data unchanged.');
      return;
    }
    const people = [
      ['Aarav Mehta', 'admin', 'ADMIN'],
      ['Nisha Rao', 'nisha', 'PM'],
      ['Kabir Shah', 'kabir', 'PM'],
      ['Ravi Kumar', 'ravi', 'DEVELOPER'],
      ['Maya Iyer', 'maya', 'DEVELOPER'],
      ['Arjun Patel', 'arjun', 'DEVELOPER'],
      ['Sara Ali', 'sara', 'DEVELOPER'],
    ];
    const ids: string[] = [];
    for (const [name, login, role] of people) {
      const row = (
        await db.query(
          'INSERT INTO users(name,email,role,password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
          [name, `${login}@fieldwork.test`, role, hash],
        )
      ).rows[0];
      ids.push(row.id);
    }
    const briefs = [
      {
        client: 'Atlas Studio',
        company: 'Atlas Design Co.',
        project: 'Atlas — Client portal',
        description:
          'A clearer handoff from the studio to its clients. Build the project overview, approvals, and file delivery experience.',
        owner: 1,
        developers: [3, 4],
        titles: [
          'Build the project overview',
          'Connect the approval workflow',
          'Review account permissions',
          'Polish the mobile navigation',
          'Add delivery email preferences',
          'Run the accessibility review',
        ],
      },
      {
        client: 'Northline',
        company: 'Northline Commerce',
        project: 'Northline — Storefront',
        description:
          'Launch the updated catalogue and checkout experience, with careful attention to performance and small screens.',
        owner: 1,
        developers: [4, 3],
        titles: [
          'Implement product filters',
          'Integrate inventory updates',
          'Complete the checkout flow',
          'Fix cart state on refresh',
          'Review product image loading',
          'Test order confirmation states',
        ],
      },
      {
        client: 'Orbit Health',
        company: 'Orbit Health Systems',
        project: 'Orbit — Operations hub',
        description:
          'Bring scheduling and internal reporting into one workspace for the operations team.',
        owner: 2,
        developers: [5, 6],
        titles: [
          'Build the weekly schedule',
          'Add report export controls',
          'Review dashboard calculations',
          'Connect team availability',
          'Improve empty report states',
          'Test keyboard navigation',
        ],
      },
    ];
    for (const [projectIndex, brief] of briefs.entries()) {
      const client = (
        await db.query('INSERT INTO clients(name,email,company) VALUES ($1,$2,$3) RETURNING id', [
          brief.client,
          `hello@${['atlas', 'northline', 'orbit'][projectIndex]}.example`,
          brief.company,
        ])
      ).rows[0];
      const project = (
        await db.query(
          'INSERT INTO projects(name,description,client_id,created_by) VALUES ($1,$2,$3,$4) RETURNING id',
          [brief.project, brief.description, client.id, ids[brief.owner]],
        )
      ).rows[0];
      for (const [i, title] of brief.titles.entries()) {
        const status = statuses[[1, 2, 0, 1, 3, 0][i]],
          priority = priorities[[2, 3, 2, 1, 0, 1][i]],
          assigned = ids[brief.developers[i % 2]],
          days = i === 0 ? -2 : i === 1 ? -1 : i + 1;
        const task = (
          await db.query(
            `INSERT INTO tasks(project_id,title,description,assigned_to,status,priority,due_date,overdue)
     VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE+$7::int,$8) RETURNING id`,
            [
              project.id,
              title,
              `Complete ${title.toLowerCase()} and verify the normal, loading, and error states. Share any remaining questions before review.`,
              assigned,
              status,
              priority,
              days,
              days < 0 && status !== 'DONE',
            ],
          )
        ).rows[0];
        await addActivity(db, task.id, ids[brief.owner], 'created', null, title);
        if (status !== 'TODO') await addActivity(db, task.id, assigned, 'status', 'TODO', status);
        if (days < 0) await addActivity(db, task.id, null, 'overdue', null, 'Overdue');
        await addNotification(db, assigned, task.id, `You were assigned “${title}”.`);
        if (status === 'IN_REVIEW')
          await addNotification(db, ids[brief.owner], task.id, `“${title}” is ready for review.`);
      }
    }
    await db.query("UPDATE activities SET created_at=now()-(id%45+2)*interval '1 minute'");
    console.log(
      'Seeded 7 users, 3 clients, 3 projects, 18 tasks, activity, and notifications. Password: use SEED_PASSWORD from .env.',
    );
  }, true);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await seed();
  } finally {
    await pool.end();
  }
}
