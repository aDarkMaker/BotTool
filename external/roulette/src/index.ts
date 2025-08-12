import { group } from 'console'
import { Session } from 'inspector/promises'
import { Context, Next, Schema } from 'koishi'

export const name = 'roulette'

export interface Config {
  enableGroups: Array<{
    groupId: string
    playerCount: number
    enabled: boolean
  }>
  globalPlayerCount: number
  penaltyProbability: number
  muteTime: number
  safePhrases: string[]
  penaltyPhrases: string[]
}

export const Config: Schema<Config> = Schema.object({
  enableGroups: Schema.array(Schema.object({
    groupId: Schema.string()
      .required()
      .description('群聊ID'),

    playerCount: Schema.number()
      .min(2)
      .max(20)
      .default(6)
      .description('此群聊允许参与的最大人数'),

    enabled: Schema.boolean()
      .default(true)
      .description('此群聊是否启用轮盘游戏'),
  }))
    .default([])
    .description('轮盘游戏的群聊设置'),

  globalPlayerCount: Schema.number()
    .min(2)
    .max(20)
    .default(6)
    .description('全局默认的最大参与人数'),
  penaltyProbability: Schema.percent()
    .min(0.01)
    .max(1)
    .default(0.15)
    .description('每次开枪触发惩罚的概率'),

  muteTime: Schema.number()
    .min(1)
    .max(60)
    .default(3)
    .description('禁言时间（分钟）'),

  safePhrases: Schema.array(Schema.string())
    .default([
      'Safe！',
      '算你走运~',
      '幻术，什么时候？',
      '我赌枪里没有子弹！',
      '你醒啦，你没死！'
    ])
    .description('平安夜语料库'),

  penaltyPhrases: Schema.array(Schema.string())
    .default([
      'Boom！',
      '死掉了，杂鱼~',
      '铸币啊，真菜……',
      'You Died！',
      '一路走好TwT'
    ])
    .description('处决语料库')
})

interface GameState {
  groupId: string
  players: string[]
  currentPlayer: number
  isActive: boolean
  maxPlayers: number
  shotCount: number
}

const gameStates = new Map<string, GameState>()

export function apply(ctx: Context, config: Config) {
  // Init Config
  function getGroupSetting(groupId: string) {
    return config.enableGroups.find(group => group.groupId === groupId)
  }

  function getMaxPlayers(groupId: string) {
    const setting = getGroupSetting(groupId)
    return setting?.playerCount || config.globalPlayerCount
  }

  function isGroupEnabled(groupId: string) {
    const setting = getGroupSetting(groupId)
    return setting && setting.enabled === true
  }

  ctx.middleware((session, next) => {
    if (session.content === '决斗！' && session.guildId && isGroupEnabled(session.guildId)) {
      const groupId = session.guildId

      if (gameStates.has(groupId)) {
        session.send('这把还没结束力！')
        return
      }

      const maxPlayers = getMaxPlayers(groupId)
      gameStates.set(groupId, {
        groupId,
        players: [],
        currentPlayer: 0,
        isActive: true,
        maxPlayers,
        shotCount: 0
      })

      session.send(`拔枪吧，就你们！(0/${maxPlayers})`)
      return
    }

    return next()
  })

  ctx.middleware(async (session, next) => {
    if (session.content === '开枪' && session.guildId) {
      const groupId = session.guildId
      const gameState = gameStates.get(groupId)

      if (!gameState || !gameState.isActive) {
        return next()
      }

      gameState.players.push(session.userId)
      gameState.shotCount++

      const isLastPlayer = gameState.players.length === gameState.maxPlayers

      const shouldPenalize = isLastPlayer || Math.random() < config.penaltyProbability

      if (shouldPenalize) {
        const phrase = config.penaltyPhrases[Math.floor(Math.random() * config.penaltyPhrases.length)]

        const member = await session.bot.getGuildMember(groupId, session.userId)

        if (member.roles[0] !== 'member') {
          session.send(`<at id="${session.userId}"/> 算你命大，哼~`)
          gameStates.delete(groupId)
          return
        }

        if (member.user.id === 'xxx') {
          session.send(`<at id="${session.userId}"/> 主人也是雑魚呢~`)
          gameStates.delete(groupId)
          return
        }

        try {
          await session.bot.muteGuildMember(
            groupId,
            session.userId,
            config.muteTime * 60 * 1000,
            '你被击中了，该罚！'
          )
          session.send(`<at id="${session.userId}"/> ${phrase}`)
        } catch (error) {
          session.send(`<at id="${session.userId}"/> 算你命大，哼~`)
        }

        gameStates.delete(groupId)
      } else {
        const phrase = config.safePhrases[Math.floor(Math.random() * config.safePhrases.length)]
        session.send(`${phrase} (${gameState.players.length}/${gameState.maxPlayers})`)
      }

      return
    }

    return next()
  })
}
