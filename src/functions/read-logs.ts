import { Provider } from '@ethersproject/providers'
import { BaseContract } from 'ethers'

import supabase from '../supabase.js'
import { FlattenedProfile } from '../types'

interface GetLogsParams {
  provider: Provider
  contract: BaseContract
  fromBlock?: number
}

/**
 * Get all registration logs from the ID Registry contract
 * @param provider Ethers provider
 * @param contract IdRegistry contract to read events from
 * @param fromBlock Block number to start reading events from
 * @returns the id and address of all registrations
 */
const getIdRegistryEvents = async ({
  provider,
  contract,
  fromBlock,
}: GetLogsParams) => {
  // Fetch Transfer or Register event logs emitted by IdRegistry

  const earlyLogs = await provider.getLogs({
    address: contract.address,
    fromBlock: 7648700,
    toBlock: 7909982,
    topics: [
      [
        '0x3cd6a0ffcc37406d9958e09bba79ff19d8237819eb2e1911f9edbce656499c87', // Register
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer
      ],
    ],
  })

  const latestLogs = await provider.getLogs({
    address: contract.address,
    fromBlock: 7909982 + 1,
    toBlock: 'latest',
    topics: [
      [
        '0x3cd6a0ffcc37406d9958e09bba79ff19d8237819eb2e1911f9edbce656499c87', // Register
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer
      ],
    ],
  })

  const logs = [...earlyLogs, ...latestLogs]

  // Sort logs by chronologically by block number (note: does not sort within blocks)
  const sortedLogs = logs.sort((a, b) =>
    a.blockNumber > b.blockNumber ? 1 : -1
  )

  const registerEvents: FlattenedProfile[] = new Array()

  for (const logRecord of sortedLogs) {
    const logDesc = contract.interface.parseLog(logRecord)
    const id = logDesc.args.id
    const to = logDesc.args.to

    if (logDesc.name == 'Register') {
      registerEvents.push({
        id: Number(id),
        owner: to,
      })
    }
  }

  return registerEvents
}

/**
 * Upsert the id and owner from recent registrations in the IdRegistry contract to Supabase
 * to make sure that we have an updated list of profiles.
 * @param provider Ethers provider
 * @param contract IdRegistry contract
 */
export async function upsertRegistrations(
  provider: Provider,
  contract: BaseContract
) {
  const currentBlock = await provider.getBlockNumber()

  // Get all logs from the ID Registry contract since creation
  const allRegistrations = await getIdRegistryEvents({
    provider,
    contract,
    fromBlock: currentBlock - 100_000, // last ~2 weeks
  })

  // Insert to Supabase to make sure we have didn't miss data while the indexer was down
  const { error } = await supabase.from('profile').upsert(allRegistrations)

  if (error) {
    console.error('Error inserting registrations', error)
  } else {
    console.log('Inserted all registrations to Supabase')
  }

  return allRegistrations
}
