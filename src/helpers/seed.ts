import 'dotenv/config';
import { Contract, providers } from 'ethers';
import { indexVerifications } from '../functions/index-verifications.js';
import { idRegistryAbi, idRegistryAddr } from './../contracts/id-registry.js';
import { IdRegistry } from './../contracts/types/id-registry.js';
import { indexAllCasts } from './../functions/index-casts.js';
import { upsertRegistrations } from './../functions/read-logs.js';
import { updateAllProfiles } from './../functions/update-profiles.js';
import log from './log.js';


// Set up the provider
const ALCHEMY_SECRET = process.env.ALCHEMY_SECRET;
const provider = new providers.AlchemyProvider('goerli', ALCHEMY_SECRET);

// Create ID Registry contract interface
const idRegistry = new Contract(
  idRegistryAddr,
  idRegistryAbi,
  provider
) as IdRegistry;

log.info('Seeding recent registrations from contract logs...');
await upsertRegistrations(provider, idRegistry);

log.info('Seeding profiles from Merkle APIs...');
await updateAllProfiles();

log.info('Seeding casts from Merkle APIs...');
await indexAllCasts(new Set());

if (process.argv.includes('--verifications')) {
  log.info('Seeding verifications from Merkle APIs...');
  await indexVerifications();
}

log.info('Seeding complete!');