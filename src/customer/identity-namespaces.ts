import type { Database } from '../db/pool.js';
import type { ServiceCredential } from '../private-api.js';
import { ConflictError } from '../domain/errors.js';

// Called by the standalone entry point before serving. Tokens can rotate;
// persisted issuer ownership and identity mode cannot silently change.
export async function registerIdentityNamespaces(db: Database, credentials: ServiceCredential[]) {
  await db.withTransaction(async client => {
    for (const c of [...credentials].sort((a, b) => a.issuer.localeCompare(b.issuer) || a.application.localeCompare(b.application))) {
      const mode = c.identityMode ?? 'isolated';
      await client.query(`insert into customer_identity_namespaces (issuer,identity_mode,onboarding) values ($1,$2,$3)
        on duplicate key update issuer=issuer`, [c.issuer, mode, c.onboarding]);
      const namespace = await client.query<{ identity_mode: string; onboarding: string }>('select identity_mode,onboarding from customer_identity_namespaces where issuer=$1 for update', [c.issuer]);
      if (namespace.rows[0]?.identity_mode !== mode || namespace.rows[0]?.onboarding !== c.onboarding) throw new ConflictError('Identity namespace reassignment requires a reviewed migration');
      await client.query(`insert into customer_application_namespaces (application,issuer) values ($1,$2)
        on duplicate key update application=application`, [c.application, c.issuer]);
      const application = await client.query<{ issuer: string }>('select issuer from customer_application_namespaces where application=$1 for update', [c.application]);
      if (application.rows[0]?.issuer !== c.issuer) throw new ConflictError('Application issuer reassignment requires a reviewed migration');
      if (mode === 'isolated') {
        const peers = await client.query<{ application: string }>('select application from customer_application_namespaces where issuer=$1', [c.issuer]);
        if (peers.rows.some(row => row.application !== c.application)) throw new ConflictError('Isolated issuer cannot be shared');
      }
    }
  });
}

export async function unlinkCompanyApplication(db: Database, issuer: string, subject: string, application: string): Promise<{ unlinked: true }> {
  return db.withTransaction(async client => {
    const mapping = await client.query<{ user_id: number | null }>('select user_id from customer_external_identities where issuer=$1 and subject=$2 for update', [issuer, subject]);
    const id = mapping.rows[0]?.user_id;
    if (!id) return { unlinked: true };
    const obligations = await client.query<{ count: number }>(`select (
      (select count(*) from billing_tasks t join applications a on a.id=t.application_id where t.user_id=$1 and a.code=$2 and t.status in ('estimated','frozen')) +
      (select count(*) from billing_locks l join billing_tasks t on t.id=l.billing_task_id join applications a on a.id=t.application_id where t.user_id=$1 and a.code=$2 and l.status='active') +
      (select count(*) from payment_orders where user_id=$1 and status='pending')
      ) as count`, [id, application]);
    if (Number(obligations.rows[0]?.count ?? 1) !== 0) throw new ConflictError('Resolve application financial responsibilities before unlinking');
    await client.query("update customer_application_memberships set status='left' where application=$1 and issuer=$2 and subject=$3 and status='active'", [application, issuer, subject]);
    return { unlinked: true };
  });
}
