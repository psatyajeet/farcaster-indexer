import { FlattenedCast } from '../types'
import { getAllTagMentions, getAllTags } from './index-casts'

const createCast = (text: string, hash: string): FlattenedCast => {
  return {
    hash,
    thread_hash: '',
    parent_hash: '',
    author_fid: 1, 
    author_username: '', 
    author_display_name: '' ,
    author_pfp_url: null,
    author_pfp_verified: null,
    text,
    published_at: new Date(),
    mentions: null,
    replies_count: 0 ,
    reactions_count: 0 ,
    recasts_count: 0,
    watches_count: 0,
    parent_author_fid: null,
    parent_author_username: null,
    deleted: false
  }
}

describe('index-casts', () => {
  test('getAllTags should return all tags', () => {
    expect(
      getAllTags([
        createCast(
          'What a goal by Saka @pc - this was a fun one! #Arsenal',
          '1'
        ),
        createCast('#Arsenal', '2'),
        createCast('F2', '3'),
        createCast('I love #F1', '4'),
        createCast('#NFTs are great', '5'),
        createCast("#you're-the-best", '6'),
        createCast('I love #independence-for-all', '7'),
        createCast(
          'ok so here is my URL https://app.supabase.com/project/#F1/settings/general',
          '8'
        ),
        createCast(
          'Consumer apps where nfts are called items and a little <i> button describes what “internet items” are and how ownership is handled by nft technology.#anti-culture #you’re-a-technology #decentralization-is-a-feature',
          '9'
        ),
        createCast(
          'one reason I keep coming back to farcaster is because there are people here who would be jealous of a project URL#same',
          '10'
        ),
      ])
    ).toStrictEqual([
      { cast_hash: '1', implicit: false, tag: 'Arsenal' },
      { cast_hash: '2', implicit: false, tag: 'Arsenal' },
      { cast_hash: '4', implicit: false, tag: 'F1' },
      { cast_hash: '5', implicit: false, tag: 'NFTs' },
      { cast_hash: '6', implicit: false, tag: "you're-the-best" },
      { cast_hash: '7', implicit: false, tag: 'independence-for-all' },
      { cast_hash: '9', implicit: false, tag: 'you’re-a-technology' },
      { cast_hash: '9', implicit: false, tag: 'decentralization-is-a-feature' },
    ])
  })

  test('getAllTagMentions should return all tags', () => {
    expect(
      getAllTagMentions(
        [
          createCast(
            'What a goal by Saka @pc - this was a fun one! Arsenal is the best',
            '1'
          ),
          createCast('F2', '2'),
          createCast('I love F1, follow me if you do too!', '3'),
          createCast('#NFTs are great', '4'),
          createCast(
            'ok so here is my URL https://app.supabase.com/project/Arsenal/settings/general',
            '5'
          ),
          createCast('I love arsenal, follow me if you do too!', '6'),
        ],
        ['Arsenal', 'F1', 'NFTs']
      )
    ).toStrictEqual([
      { cast_hash: '1', implicit: true, tag: 'Arsenal' },
      { cast_hash: '3', implicit: true, tag: 'F1' },
      { cast_hash: '6', implicit: true, tag: 'arsenal' },
    ])
  })
})
