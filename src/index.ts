import 'dotenv/config';
import { Contract, providers } from 'ethers';
import cron from 'node-cron';
import { idRegistryAbi, idRegistryAddr } from './contracts/id-registry';
import { IdRegistry, IdRegistryEvents } from './contracts/types/id-registry';
import { indexAllCasts } from './functions/index-casts';
import { indexVerifications } from './functions/index-verifications';
import { upsertRegistrations } from './functions/read-logs';
import { updateAllProfiles } from './functions/update-profiles';
import log from './helpers/log';
import supabase from './supabase';
import { FlattenedProfile } from './types/index';


// Set up the provider
const ALCHEMY_SECRET = process.env.ALCHEMY_SECRET;
const provider = new providers.AlchemyProvider('goerli', ALCHEMY_SECRET);

// Create ID Registry contract interface
const idRegistry = new Contract(
  idRegistryAddr,
  idRegistryAbi,
  provider
) as IdRegistry;

// Listen for new events on the ID Registry
const eventToWatch: IdRegistryEvents = 'Register';
idRegistry.on(eventToWatch, async (to, id) => {
  log.info('New user registered.', Number(id), to);

  const profile: FlattenedProfile = {
    id: Number(id),
    owner: to,
    registered_at: new Date(),
  };

  // Save to supabase
  await supabase.from('profile').insert(profile);
});

// Make sure we didn't miss any profiles when the indexer was offline
await upsertRegistrations(provider, idRegistry);

const processedHashes = new Set<string>();

// Run job every 15 minutes
cron.schedule('5,20,45,55 * * * *', async () => {
  try {
    // Get random number to assign to process
    const random = Math.floor(Math.random() * 1000);

    log.info(`[${random}] - Starting every 15 minute index job`);
    const processedCastHashes = await indexAllCasts(
      processedHashes,
      10_000,
      random
    );

    // Add processedCastHashes to processedHashes
    processedCastHashes.forEach((hash) => processedHashes.add(hash));

    await updateAllProfiles();
  } catch (error) {
    log.error('Error in every 15 minute index job', error);
  }
});

// Run job every hour
cron.schedule('0 * * * *', async () => {
  try {
    log.info(`Starting index verifications`);
    await indexVerifications();
  } catch (error) {
    log.error('Error in every hour index job', error);
  }
});

// Run job every 24 hours at 7:30
cron.schedule('30 19 * * *', async () => {
  try {
    const random = Math.floor(Math.random() * 1000);

    log.info(`[${random}] Starting seed job at ${new Date()}`);
    const processedCastHashes = await indexAllCasts(new Set(), null, random);

    // Add processedCastHashes to processedHashes
    processedCastHashes.forEach((hash) => processedHashes.add(hash));
  } catch (error) {
    log.error('Error in every hour index job', error);
  }
});