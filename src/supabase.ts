import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient = null

// if (process.env.NODE_ENV !== 'test') {
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase environment variables')
}

supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
// }

export default supabase
