import type { Pool, PoolClient } from 'pg';
export async function transaction<T>(pool:Pool,operation:(client:PoolClient)=>Promise<T>,actor='user',isolation:'read committed'|'repeatable read'='read committed'):Promise<T> {
  const client=await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    await client.query("SELECT set_config('lifeos.actor',$1,true)",[actor]);
    const value=await operation(client);
    await client.query('COMMIT');return value;
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
