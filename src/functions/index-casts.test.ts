import { FlattenedCast } from '../types'
import { getAllTagMentions, getAllTags } from './index-casts'

const today = new Date('2023-02-01')

const createCast = (text: string, hash: string): FlattenedCast => {
  return {
    hash,
    thread_hash: '',
    parent_hash: '',
    author_fid: 1,
    author_username: '',
    author_display_name: '',
    author_pfp_url: null,
    author_pfp_verified: null,
    text,
    published_at: today,
    mentions: null,
    replies_count: 0,
    reactions_count: 0,
    recasts_count: 0,
    watches_count: 0,
    parent_author_fid: null,
    parent_author_username: null,
    deleted: false,
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
        createCast(
          'What a race by Alonso. Driver of the day hands down!  #F1',
          '11'
        ),
      ])
    ).toStrictEqual([
      { cast_hash: '1', implicit: false, tag: 'Arsenal', published_at: today },
      { cast_hash: '2', implicit: false, tag: 'Arsenal', published_at: today },
      { cast_hash: '4', implicit: false, tag: 'F1', published_at: today },
      { cast_hash: '5', implicit: false, tag: 'NFTs', published_at: today },
      {
        cast_hash: '6',
        implicit: false,
        tag: "you're-the-best",
        published_at: today,
      },
      {
        cast_hash: '7',
        implicit: false,
        tag: 'independence-for-all',
        published_at: today,
      },
      {
        cast_hash: '9',
        implicit: false,
        tag: 'you’re-a-technology',
        published_at: today,
      },
      {
        cast_hash: '9',
        implicit: false,
        tag: 'decentralization-is-a-feature',
        published_at: today,
      },
      { cast_hash: '11', implicit: false, tag: 'F1', published_at: today },
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
          createCast(
            'It’s a great weekend for people joining farcaster! A warm welcome to @crump whose work I mentioned in December https://sharecaster.xyz/pdr/0xf19f01',
            '7'
          ),
          createCast('Purple #153 received a bid of 0.11Ξ from kmacb.eth', '8'),
          createCast(
            "Not sure either. But feel free to discuss it in Purple's Discord https://discord.gg/kx2faZqn",
            '9'
          ),
        ],
        ['Arsenal', 'F1', 'NFTs', 'bitcoin', 'purple']
      )
    ).toStrictEqual([
      { cast_hash: '1', implicit: true, tag: 'Arsenal', published_at: today },
      { cast_hash: '3', implicit: true, tag: 'F1', published_at: today },
      { cast_hash: '6', implicit: true, tag: 'arsenal', published_at: today },
      { cast_hash: '8', implicit: true, tag: 'Purple', published_at: today },
      { cast_hash: '9', implicit: true, tag: 'Purple', published_at: today },
    ])
  })
})
