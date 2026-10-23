import type { Database } from "../db/pool.js";
import { ConflictError } from "../domain/errors.js";
import { comparePoints } from "../domain/points.js";

/** Called only after the product has authenticated and authorized account deletion.
 * Financial identity is retained; reusable login identifiers are released atomically.
 * Returning users must receive a new immutable product subject.
 */
export async function closeCustomer(db: Database, issuer: string, subject: string): Promise<{ closed: true }> {
  return db.withTransaction(async client => {
    await client.query(`insert into customer_external_identities (issuer, subject) values ($1, $2)
      on duplicate key update issuer = issuer`, [issuer, subject]);
    const mapping = await client.query<{ user_id: number | null; account_id: number | null }>(
      "select user_id, account_id from customer_external_identities where issuer = $1 and subject = $2 for update", [issuer, subject]);
    const row = mapping.rows[0];
    if (!row) throw new Error("Missing customer mapping");
    if (row.user_id === null) {
      // Tombstone even a subject which has never provisioned a wallet. A delayed
      // provision request must not recreate it after the product deletes its login.
      const user = await client.query("insert into users (status) values ('closed')");
      if (!user.insertId) throw new Error("Missing tombstone ID");
      await client.query("update customer_external_identities set user_id = $1 where issuer = $2 and subject = $3", [user.insertId, issuer, subject]);
      return { closed: true };
    }
    const users = await client.query<{ status: string }>("select status from users where id = $1 for update", [row.user_id]);
    if (users.rows[0]?.status === "closed") return { closed: true };
    if (!users.rows[0]) throw new Error("Missing customer");
    const wallets = await client.query<{ id: number; total_balance: string; locked_balance: string }>(
      "select id, total_balance, locked_balance from credit_accounts where user_id = $1 order by id for update", [row.user_id]);
    if (wallets.rows.some(w => comparePoints(w.total_balance, "0") !== 0 || comparePoints(w.locked_balance, "0") !== 0)) {
      throw new ConflictError("Resolve remaining credits and reservations before closing the account");
    }
    // Fail closed for legacy responsibilities. Closure is not a cash refund and
    // cannot silently abandon enterprise ownership, referrals, or unpaid orders.
    const obligations = await client.query<{ count: number }>(`select (
      (select count(*) from payment_orders where user_id = $1 and status = 'pending') +
      (select count(*) from billing_tasks where user_id = $1 and status in ('estimated', 'frozen')) +
      (select count(*) from billing_locks l join billing_tasks t on t.id = l.billing_task_id where t.user_id = $1 and l.status = 'active') +
      (select count(*) from platform_admins where user_id = $1 and status = 'active') +
      (select count(*) from agent_profiles where user_id = $1 and status in ('pending', 'approved')) +
      (select count(*) from tenant_members where user_id = $1 and status <> 'disabled') +
      (select count(*) from agent_relations where (agent_user_id = $1 or referred_user_id = $1) and status = 'active') +
      (select count(*) from agent_commissions where (agent_user_id = $1 or referred_user_id = $1) and status = 'pending')
      ) as count`, [row.user_id]);
    if (Number(obligations.rows[0]?.count ?? 1) !== 0) throw new ConflictError("Resolve outstanding account responsibilities before closing");
    await client.query("update credit_accounts set status = 'closed', updated_at = now() where user_id = $1", [row.user_id]);
    await client.query("update users set phone = null, email = null, username = null, password_hash = null, status = 'closed', updated_at = now() where id = $1", [row.user_id]);
    return { closed: true };
  });
}
