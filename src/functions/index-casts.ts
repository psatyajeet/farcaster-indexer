import got from 'got'

import { MERKLE_REQUEST_OPTIONS } from '../merkle'
import supabase from '../supabase'
import { Cast, CastTag, FlattenedCast, MerkleResponse } from '../types/index'
import { breakIntoChunks } from '../utils'

/**
 * Index the casts from all Farcaster profiles and insert them into Supabase
 * @param limit The max number of recent casts to index
 */
export async function indexAllCasts(limit?: number) {
  const startTime = Date.now()
  console.log(`Indexing casts at ${startTime.toString()}...`)
  const allCasts = await getAllCasts(limit)
  const cleanedCasts = cleanCasts(allCasts)

  const formattedCasts: FlattenedCast[] = cleanedCasts.map((c) => {
    return {
      hash: c.hash,
      thread_hash: c.threadHash,
      parent_hash: c.parentHash || null,
      author_fid: c.author.fid,
      author_username: c.author.username || null,
      author_display_name: c.author.displayName,
      author_pfp_url: c.author.pfp?.url || null,
      author_pfp_verified: c.author.pfp?.verified || false,
      text: c.text,
      published_at: new Date(c.timestamp),
      mentions: c.mentions || null,
      replies_count: c.replies.count,
      reactions_count: c.reactions.count,
      recasts_count: c.recasts.count,
      watches_count: c.watches.count,
      parent_author_fid: c.parentAuthor?.fid || null,
      parent_author_username: c.parentAuthor?.username || null,
      deleted: false,
    }
  })

  // Break formattedCasts into chunks of 1000
  const chunks = breakIntoChunks(formattedCasts, 1000)

  // Upsert each chunk into the Supabase table
  for (const chunk of chunks) {
    const { error } = await supabase.from('casts').upsert(chunk, {
      onConflict: 'hash',
    })

    if (error) {
      throw error
    }
  }

  console.log(`Started getting tags`)
  // Get all tags from the casts
  const allTags = getAllTags(formattedCasts)
  console.log(`Finished getting tags`)

  // Break allTags into chunks of 1000
  const tagChunks = breakIntoChunks(allTags, 1000)

  // Upsert each chunk into the Supabase table
  for (const tagChunk of tagChunks) {
    const { error } = await supabase.from('cast_tags').upsert(tagChunk, {
      onConflict: 'cast_hash,tag',
    })

    if (error) {
      throw error
    }
  }

  console.log(`Started getting tag mentions`)
  // Get all unique tags from cast_tags table
  const { data, error } = await supabase.from('cast_tags').select('tag')
  if (error || !data) {
    console.log(`No tags found`)
  } else {
    const uniqueTags = Array.from(new Set(data.map((d) => d.tag)))
    const tagMentions = getAllTagMentions(formattedCasts, uniqueTags)

    // Break allTags into chunks of 1000
    const tagChunks = breakIntoChunks(tagMentions, 1000)

    // Upsert each chunk into the Supabase table
    for (const tagChunk of tagChunks) {
      const { error } = await supabase.from('cast_tags').upsert(tagChunk, {
        onConflict: 'cast_hash,tag',
      })

      if (error) {
        throw error
      }
    }
  }

  const endTime = Date.now()
  const duration = (endTime - startTime) / 1000

  if (duration > 60) {
    // If it takes more than 60 seconds, log the duration so we can optimize
    console.log(`Updated ${formattedCasts.length} casts in ${duration} seconds`)
  }

  console.log(`Finished indexing casts at ${endTime.toString()}`)
}

/**
 * Get the latest casts from the Merkle API. 100k casts every ~35 seconds on local machine.
 * @param limit The maximum number of casts to return. If not provided, all casts will be returned.
 * @returns An array of all casts on Farcaster
 */
async function getAllCasts(limit?: number): Promise<Cast[]> {
  const allCasts: Cast[] = new Array()
  let endpoint = buildCastEndpoint()

  while (true) {
    const _response = await got(endpoint, MERKLE_REQUEST_OPTIONS).json()

    const response = _response as MerkleResponse
    const casts = response.result.casts

    if (!casts) throw new Error('No casts found')

    for (const cast of casts) {
      allCasts.push(cast)
    }

    // If limit is provided, stop when we reach it
    if (limit && allCasts.length >= limit) {
      break
    }

    // If there are more casts, get the next page
    const cursor = response.next?.cursor
    if (cursor) {
      endpoint = buildCastEndpoint(cursor)
    } else {
      break
    }
  }

  return allCasts
}

/**
 * Helper function to build the profile endpoint with a cursor
 * @param cursor
 */
function buildCastEndpoint(cursor?: string): string {
  return `https://api.warpcast.com/v2/recent-casts?limit=1000${
    cursor ? `&cursor=${cursor}` : ''
  }`
}

function cleanCasts(casts: Cast[]): Cast[] {
  const cleanedCasts: Cast[] = new Array()

  for (const cast of casts) {
    // Remove recasts
    if (cast.text.startsWith('recast:farcaster://')) continue

    // TODO: find way to remove deleted casts

    // Remove some data from mentions
    if (cast.mentions) {
      cast.mentions = cast.mentions.map((m) => {
        return {
          fid: m.fid,
          username: m.username,
          displayName: m.displayName,
          pfp: m.pfp,
        }
      })
    }

    cleanedCasts.push(cast)
  }

  return cleanedCasts
}

export function getAllTags(casts: FlattenedCast[]): CastTag[] {
  const TAGS_TO_IGNORE = ['what', 'things', 'did', 'post']
  const cleanedTags: CastTag[] = new Array()

  for (const cast of casts) {
    const text = cast.text.replace(/(https?:\/\/[^\s]+)/g, '')
    // Find all hashtags in text
    // const tags = text.match(/#[a-zA-Z][\w[:punct:]\-_]+/g) // matches a letter followed by any letter or number

    const tags = text.match(/(?:^|\s)#([a-zA-Z][\w’'_-]+)/g) // matches a letter followed by any letter or number

    // If no matches found, continue
    if (!tags) {
      continue
    } else {
      const processedTags = new Set<string>(TAGS_TO_IGNORE)
      for (const tag of tags) {
        const cleanedTag = tag.replaceAll('#', '').trim()
        const lowerCaseTag = cleanedTag.toLowerCase()
        if (cleanedTag.length < 2) {
          continue // Skip tags that are just a single character
        }
        if (processedTags.has(lowerCaseTag)) {
          continue // Skip tags that have already been processed
        }
        cleanedTags.push({
          cast_hash: cast.hash,
          tag: cleanedTag,
          implicit: false,
          published_at: cast.published_at,
        })
        processedTags.add(lowerCaseTag)
      }
    }
  }

  return cleanedTags
}

export function getAllTagMentions(
  casts: FlattenedCast[],
  tags: string[]
): CastTag[] {
  const cleanedTags: CastTag[] = new Array()
  const singleStringTags = tags.join('|')

  for (const cast of casts) {
    const text = cast.text
      .replace(/(https?:\/\/[^\s]+)/g, '')
      .replace(/#[a-zA-Z][\w]+/g, '')

    // Find all instances of tags in text
    const matches = text.match(new RegExp(`\\b(${singleStringTags})\\b`, 'gi'))

    // If no matches found, continue
    if (!matches) {
      continue
    } else {
      const processedTags = new Set<string>()
      for (const match of matches) {
        const lowerCaseTag = match.toLowerCase()
        if (processedTags.has(lowerCaseTag)) {
          continue // Skip tags that have already been processed
        }
        cleanedTags.push({
          cast_hash: cast.hash,
          tag: match,
          implicit: true,
          published_at: cast.published_at,
        })
        processedTags.add(lowerCaseTag)
      }
    }
  }

  return cleanedTags
}
