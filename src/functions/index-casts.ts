import got from 'got';
import log from '../helpers/log';
import { MERKLE_REQUEST_OPTIONS } from '../merkle';
import supabase from '../supabase';
import { Cast, CastTag, FlattenedCast, MerkleResponse } from '../types/index';
import { breakIntoChunks } from '../utils';


// This isn't deduped for different capitalizations of the same tag
interface DbTagCount {
  tag: string;
  tag_count: number;
}

/**
 * Index the casts from all Farcaster profiles and insert them into Supabase
 * @param limit The max number of recent casts to index
 */
export async function indexAllCasts(
  alreadyProcessedHashes: Set<string>,
  limit: number | null,
  processNumber?: number
): Promise<string[]> {
  const startTime = Date.now();
  const allCasts = await getAllCasts(limit);
  const cleanedCasts = cleanCasts(allCasts, alreadyProcessedHashes);

  const formattedCasts: FlattenedCast[] = cleanedCasts.map((c) => {
    const cast: FlattenedCast = {
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
    };

    // Retain v1 hashes for backwards compatibility (remove after 3/21/2023)
    if (c._hashV1) {
      cast.hash_v1 = c._hashV1;
      cast.thread_hash_v1 = c._threadHashV1;
      cast.parent_hash_v1 = c._parentHashV1 || null;
    }

    return cast;
  });

  const formattedCastHashes = formattedCasts.map((c) => c.hash);

  // Break formattedCasts into chunks of 100
  const chunks = breakIntoChunks(formattedCasts, 100);

  log.info(
    `Started upserting casts, ${formattedCasts.length} total in ${chunks.length} chunks`
  );

  // Upsert each chunk into the Supabase table
  for (const chunk of chunks) {
    const { error } = await supabase.from('casts').upsert(chunk, {
      onConflict: 'hash',
    });

    if (error) {
      throw error;
    }
  }

  log.info(`Finished upserting casts`);

  log.info(`Started getting tags`);
  // Get all tags from the casts
  const allTags = await getAllTags(formattedCasts);
  log.info(`Finished getting tags`);

  // Break allTags into chunks of 100
  const tagChunks = breakIntoChunks(allTags, 100);

  log.info(
    `Started upserting tags, ${allTags.length} total in ${tagChunks.length} chunks`
  );
  // Upsert each chunk into the Supabase table
  for (const tagChunk of tagChunks) {
    const { error } = await supabase.from('cast_tags').upsert(tagChunk, {
      onConflict: 'cast_hash,tag',
    });

    if (error) {
      throw error;
    }
  }
  log.info(`Finished upserting tags`);

  log.info(`Started getting tag mentions`);
  // Get all unique tags from cast_tags table
  const data = await getUniqueCastTags();
  log.info(`Finished getting tag mentions`);

  if (!data) {
    log.warn(`No tags found`);
  } else {
    const uniqueTags = Array.from(new Set(data.map((d) => d.tag)));
    const tagMentions = getAllTagMentions(formattedCasts, uniqueTags);

    // Break allTags into chunks of 100
    const tagChunks = breakIntoChunks(tagMentions, 100);

    log.info(
      `Started upserting tags mentions, ${tagMentions.length} total in ${tagChunks.length} chunks`
    );
    // Upsert each chunk into the Supabase table
    for (const tagChunk of tagChunks) {
      const { error } = await supabase.from('cast_tags').upsert(tagChunk, {
        onConflict: 'cast_hash,tag',
      });

      if (error) {
        throw error;
      }
    }
    log.info(`Finished upserting tags mentions`);
  }

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  if (duration > 60) {
    // If it takes more than 60 seconds, log the duration so we can optimize
    log.info(`Updated ${formattedCasts.length} casts in ${duration} seconds`);
  }

  log.info(`Finished indexing casts at ${endTime.toString()}`);

  return formattedCastHashes;
}

/**
 * Get the latest casts from the Merkle API. 100k casts every ~35 seconds on local machine.
 * @param limit The maximum number of casts to return. If not provided, all casts will be returned.
 * @returns An array of all casts on Farcaster
 */
async function getAllCasts(limit?: number | null): Promise<Cast[]> {
  const allCasts: Cast[] = new Array();
  let endpoint = buildCastEndpoint();

  while (true) {
    const _response = await got(endpoint, MERKLE_REQUEST_OPTIONS).json();

    const response = _response as MerkleResponse;
    const casts = response.result.casts;

    if (!casts) throw new Error('No casts found');

    for (const cast of casts) {
      // Prefixes of mm-fc- fc-mm- ff-mm- are the current ones we use to filter from client. Before when we allowed underscores it was __tt__.
      if (
        cast.author.username?.includes('mm-fc-') ||
        cast.author.username?.includes('fc-mm-') ||
        cast.author.username?.includes('ff-mm-') ||
        cast.author.username?.includes('__tt__-')
      ) {
        continue;
      }
      allCasts.push(cast);
    }

    // If limit is provided, stop when we reach it
    if (limit && allCasts.length >= limit) {
      break;
    }

    // If there are more casts, get the next page
    const cursor = response.next?.cursor;
    if (cursor) {
      endpoint = buildCastEndpoint(cursor);
    } else {
      break;
    }
  }

  return allCasts;
}

/**
 * Helper function to build the profile endpoint with a cursor
 * @param cursor
 */
function buildCastEndpoint(cursor?: string): string {
  return `https://api.warpcast.com/v2/recent-casts?limit=1000${
    cursor ? `&cursor=${cursor}` : ''
  }`;
}

function cleanCasts(
  casts: Cast[],
  alreadyProcessedHashes: Set<string>
): Cast[] {
  const cleanedCasts: Cast[] = new Array();

  for (const cast of casts) {
    // Remove already processed casts
    if (alreadyProcessedHashes.has(cast.hash)) continue;

    // Remove recasts
    if (cast.text.startsWith('recast:farcaster://')) continue;

    // TODO: find way to remove deleted casts

    // Remove some data from mentions
    if (cast.mentions) {
      cast.mentions = cast.mentions.map((m) => {
        return {
          fid: m.fid,
          username: m.username,
          displayName: m.displayName,
          pfp: m.pfp,
        };
      });
    }

    cleanedCasts.push(cast);
  }

  return cleanedCasts;
}

const PAGE_LIMIT = 1000;

async function getUniqueCastTags(): Promise<DbTagCount[]> {
  const dataCount = await supabase
    .from('unique_cast_tags')
    .select('*', { count: 'exact', head: true });

  if (dataCount.error || !dataCount.count) {
    return [];
  }

  const count = dataCount.count;

  let tags = [] as DbTagCount[];

  for (let i = 0; i < count; i += PAGE_LIMIT) {
    const data = await supabase
      .from('unique_cast_tags')
      .select()
      .range(i, i + PAGE_LIMIT);

    if (data.error || !data.data) {
      throw data.error;
    }

    tags = tags.concat(data.data as DbTagCount[]);
  }

  return tags;
}

function generatePrompt(cast: string): string {
  return `A tweet is shared below between backticks. Read the tweet and come up with 1-3 hashtags to describe the tweet. Hashtags should have one word only. Return a comma separated list of hashtags after the text "Hashtags:"

  \`\`\`
  ${cast}
  \`\`\`
  
  Hashtags:`;
}

function getCleanedTag(
  tag: string,
  processedTags: Set<string>
): { cleanedTag: string; lowerCaseTag: string } | null {
  const cleanedTag = tag.replaceAll('#', '').trim();
  const lowerCaseTag = cleanedTag.toLowerCase();
  if (cleanedTag.length < 2) {
    return null; // Skip tags that are just a single character
  }
  if (processedTags.has(lowerCaseTag)) {
    return null; // Skip tags that have already been processed
  }
  if (!cleanedTag) {
    return null; // Skip empty tags
  }

  return { cleanedTag, lowerCaseTag };
}

export async function getAllTags(casts: FlattenedCast[]): Promise<CastTag[]> {
  const TAGS_TO_IGNORE = ['what', 'things', 'did', 'post', 'new'];
  const cleanedTags: CastTag[] = new Array();

  for (const cast of casts) {
    const text = cast.text.replace(/(https?:\/\/[^\s]+)/g, '');
    // Find all hashtags in text
    const tags = text.match(/(?:^|\s)#([a-zA-Z][\w’'_-]+)/g) as string[]; // matches a letter followed by any letter or number

    // Get tags from GPT
    let gptTags: string[] = [];
    const prompt = generatePrompt(text);
    const gptResponse = await createChatCompletion(prompt);
    if (gptResponse.status === 200) {
      const { data } = gptResponse;
      const tagsString: string = data.choices[0].message.content;
      const usage = data.usage;

      gptTags = tagsString.split(',').map((t) => t.trim());
    }

    // If no matches found, continue
    if (tags || gptTags.length > 0) {
      const processedTags = new Set<string>(TAGS_TO_IGNORE);
      for (const tag of tags || []) {
        const cleanedTag = getCleanedTag(tag, processedTags);
        if (!cleanedTag) {
          continue;
        }
        cleanedTags.push({
          cast_hash: cast.hash,
          tag: cleanedTag.cleanedTag,
          implicit: false,
          gpt: false,
          published_at: cast.published_at,
        });
        processedTags.add(cleanedTag.lowerCaseTag);
      }

      for (const tag of gptTags) {
        const cleanedTag = getCleanedTag(tag, processedTags);
        if (!cleanedTag) {
          continue;
        }
        cleanedTags.push({
          cast_hash: cast.hash,
          tag: cleanedTag.cleanedTag,
          implicit: false,
          gpt: true,
          published_at: cast.published_at,
        });
        processedTags.add(cleanedTag.lowerCaseTag);
      }
    }
  }

  return cleanedTags;
}

export function getAllTagMentions(
  casts: FlattenedCast[],
  tags: string[]
): CastTag[] {
  const cleanedTags: CastTag[] = new Array();
  const singleStringTags = tags.join('|');

  for (const cast of casts) {
    const text = cast.text
      .replace(/(https?:\/\/[^\s]+)/g, '')
      .replace(/#[a-zA-Z][\w]+/g, '');

    // Find all instances of tags in text
    const matches = text.match(new RegExp(`\\b(${singleStringTags})\\b`, 'gi'));

    // If no matches found, continue
    if (!matches) {
      continue;
    } else {
      const processedTags = new Set<string>();
      for (const match of matches) {
        const lowerCaseTag = match.toLowerCase();
        if (!match || processedTags.has(lowerCaseTag)) {
          continue; // Skip tags that have already been processed or are empty
        }
        const cleanedTag = {
          cast_hash: cast.hash,
          tag: match,
          implicit: true,
          gpt: false,
          published_at: cast.published_at,
        };
        cleanedTags.push(cleanedTag);
        processedTags.add(lowerCaseTag);
      }
    }
  }

  return cleanedTags;
}