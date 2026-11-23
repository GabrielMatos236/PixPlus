import pg from 'pg'
import { config } from './config.js'

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 10,
})