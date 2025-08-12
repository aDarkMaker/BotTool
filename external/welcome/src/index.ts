import { Context, Schema, h } from 'koishi'

export const name = 'welcome'

export interface Config {
  welcomeMessage: string
  cooldownDuration: number
}

export const Config: Schema<Config> = Schema.object({
  welcomeMessage: Schema.string().default('进群请先按规则实名，有问题记得先看群文档和精华消息哦~').description('新成员加入时发送的欢迎消息'),
  cooldownDuration: Schema.number().default(300000).description('冷却时间（毫秒），默认5分钟')
})

export function apply(ctx: Context, config: Config) {
  // 存储每个群的最后发送时间
  const lastWelcomeTime = new Map<string, number>()

  ctx.on('guild-member-added', async (session) => {
    const guildId = session.guildId
    if (!guildId) return

    const now = Date.now()
    const lastTime = lastWelcomeTime.get(guildId) || 0

    // 检查是否在冷却时间内
    if (now - lastTime < config.cooldownDuration) {
      return
    }

    // 更新最后发送时间
    lastWelcomeTime.set(guildId, now)

    // 发送欢迎消息
    await session.send(config.welcomeMessage)
  })
}