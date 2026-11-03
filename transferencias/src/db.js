import pg from 'pg'
import { config } from './config.js'

// Um pool só para o serviço inteiro: conexões abertas são reaproveitadas
// entre requisições, em vez de abrir uma nova a cada pedido.
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
})
