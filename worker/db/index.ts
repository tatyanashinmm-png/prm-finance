import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

// Единственная точка входа к базе. Остальной код (маршруты API и т.д.)
// не должен импортировать drizzle-orm или обращаться к env.DB напрямую —
// только вызывать функции отсюда. При смене платформы меняется этот файл.
export interface DbEnv {
  DB: D1Database;
}

function client(env: DbEnv) {
  return drizzle(env.DB, { schema });
}

export async function getContracts(env: DbEnv) {
  return client(env)
    .select({
      id: schema.contracts.id,
      contractNum: schema.contracts.contractNum,
      clientName: schema.contracts.clientName,
      legalEntity: schema.contracts.legalEntity,
      status: schema.contracts.status,
      manager: schema.contracts.manager,
      updatedAt: schema.contracts.updatedAt,
    })
    .from(schema.contracts)
    .all();
}
