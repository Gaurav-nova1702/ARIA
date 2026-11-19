
import { createClient } from '@supabase/supabase-js'

// Same Supabase project used by your teammate's login page.
const SUPABASE_URL = 'https://bunndpksxemtcbhfkzbv.supabase.co'

const SUPABASE_ANON_KEY =
  'sb_publishable_MdY9HvRf9u5k-9JZ6gQooA_ZARyzu1A'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)

export default supabase
