import { Context, Schema } from 'koishi'

export const name = 'prepetiton'

export interface Config {
  maxRepeat: number
  imageUrl: string
  ignoreContents: string[]
}

export const Config: Schema<Config> = Schema.object({
  maxRepeat: Schema.natural().min(2).default(4).description('最大重复次数'),
  imageUrl: Schema.string().default('the path to img').description('打断复读的图片路径'),
  ignoreContents: Schema.array(Schema.string()).default([]).description('忽略内容')
})

export function apply(ctx: Context, config: Config) {
  const states = new Map<string, {
    content: string
    times: number
  }>()

  function getState(channelId: string) {
    if (!states.has(channelId)) {
      states.set(channelId, {
        content: '',
        times: 0
      })
    }
    return states.get(channelId)!
  }

  ctx.middleware((session, next) => {
    const { content, channelId, userId, selfId } = session

    if (userId === selfId) return next()

    if (config.ignoreContents.includes(content)) return next()

    const state = getState(channelId)

    if (content === state.content) {
      state.times += 1

      if (state.times >= config.maxRepeat) {
        state.content = ''
        state.times = 0
        session.send(`<img src="${config.imageUrl}"/>`)
        return 
      }
    } else {
      state.content = content
      state.times = 1
    }

    return next()
  })
}