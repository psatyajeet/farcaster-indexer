import 'dotenv/config'
import { Contract, providers } from 'ethers'
import cron from 'node-cron'

import { idRegistryAbi, idRegistryAddr } from './contracts/id-registry'
import { IdRegistry, IdRegistryEvents } from './contracts/types/id-registry'
import { indexAllCasts } from './functions/index-casts'
import { indexVerifications } from './functions/index-verifications'
import { upsertAllRegistrations } from './functions/read-logs'
import { updateAllProfiles } from './functions/update-profiles'
import supabase from './supabase'
import { FlattenedProfile } from './types/index'

// Set up the provider
const ALCHEMY_SECRET = process.env.ALCHEMY_SECRET
const provider = new providers.AlchemyProvider('goerli', ALCHEMY_SECRET)

// Create ID Registry contract interface
const idRegistry = new Contract(
  idRegistryAddr,
  idRegistryAbi,
  provider
) as IdRegistry

// Listen for new events on the ID Registry
const eventToWatch: IdRegistryEvents = 'Register'
idRegistry.on(eventToWatch, async (to, id) => {
  console.log('New user registered.', Number(id), to)

  const profile: FlattenedProfile = {
    id: Number(id),
    owner: to,
    registered_at: new Date(),
  }

  // Save to supabase
  await supabase.from('profile').insert(profile)
})

// Make sure we didn't miss any profiles when the indexer was offline
await upsertAllRegistrations(provider, idRegistry)

// Run job every minute
cron.schedule('* * * * *', async () => {
  await indexAllCasts(10_000)
  await updateAllProfiles()
})

// Run job every hour
cron.schedule('0 * * * *', async () => {
  await indexVerifications()
})
