import { Context, Schema, h, Session } from 'koishi'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export const name = 'kill'

export interface Config {
  deleteMessageCount: number
}

export const Config: Schema<Config> = Schema.object({
  deleteMessageCount: Schema.number().default(100).description('删除消息的数量限制')
})

interface DeletedMessage {
  messageId: number
  userId: number
  content: string
  timestamp: number
  groupId: string
  deleteTime: number
}

export function apply(ctx: Context, config: Config) {
  // 存储群消息记录，用于删除用户消息
  const messageHistory = new Map<string, Array<{ messageId: number, userId: number, timestamp: number, content: string }>>()

  // 读取关键词配置
  let keywordsConfig: { keywords: string[], enabled: boolean } = { keywords: [], enabled: false }
  try {
    const keywordsPath = resolve(__dirname, '../key.json')
    const keywordsData = readFileSync(keywordsPath, 'utf-8')
    keywordsConfig = JSON.parse(keywordsData)
  } catch (error) {
    console.warn('无法读取关键词配置文件:', error)
  }

  // 读取已删除消息记录
  let deletedMessages: DeletedMessage[] = []
  const deletedMessagesPath = resolve(__dirname, '../del.json')

  try {
    if (existsSync(deletedMessagesPath)) {
      const deletedData = readFileSync(deletedMessagesPath, 'utf-8')
      deletedMessages = JSON.parse(deletedData)
    }
  } catch (error) {
    console.warn('无法读取已删除消息文件:', error)
    deletedMessages = []
  }

  // 保存已删除消息到文件
  const saveDeletedMessages = () => {
    try {
      writeFileSync(deletedMessagesPath, JSON.stringify(deletedMessages, null, 2), 'utf-8')
    } catch (error) {
      console.error('保存已删除消息文件失败:', error)
    }
  }

  // 二次清扫
  const simulateManualKill = async (session: Session, targetUserId: string) => {
    console.log(`正在模拟手动执行: kill ${targetUserId}`)

    // 等待一小段时间，模拟人工操作的延迟
    await new Promise(resolve => setTimeout(resolve, 3000))

    // 创建一个模拟的session来执行kill命令
    // 这里我们直接调用executeKillCleanup，因为用户已经被踢出了
    return await executeKillCleanup(session, targetUserId)
  }

  const executeKillCleanup = async (session: Session, targetUserId: string) => {
    const groupId = session.channelId

    try {
      // 删除该用户的消息并保存记录
      const history = messageHistory.get(groupId)
      let deletedCount = 0

      if (history) {
        const userMessages = history
          .filter(msg => msg.userId === Number(targetUserId))
          .slice(-config.deleteMessageCount)
          .reverse()

        console.log(`找到用户 ${targetUserId} 的 ${userMessages.length} 条消息，正在删除...`)

        for (const msg of userMessages) {
          try {
            await session.bot.deleteMessage(session.channelId, msg.messageId.toString())

            // 保存被删除的消息到记录中
            deletedMessages.push({
              messageId: msg.messageId,
              userId: msg.userId,
              content: msg.content || '',
              timestamp: msg.timestamp,
              groupId: groupId,
              deleteTime: Date.now()
            })

            deletedCount++
            await new Promise(resolve => setTimeout(resolve, 150))
          } catch (error) {
            console.warn(`删除消息 ${msg.messageId} 失败:`, error.message || error)
          }
        }

        // 从历史记录中移除该用户的消息
        messageHistory.set(groupId, history.filter(msg => msg.userId !== Number(targetUserId)))

        // 检测是否还有遗漏的消息
        await new Promise(resolve => setTimeout(resolve, 2000))

        const updatedHistory = messageHistory.get(groupId)
        if (updatedHistory) {
          const remainingMessages = updatedHistory.filter(msg => msg.userId === Number(targetUserId))

          if (remainingMessages.length > 0) {
            console.log(`检测到用户 ${targetUserId} 还有 ${remainingMessages.length} 条遗漏消息，正在清理...`)

            for (const msg of remainingMessages.reverse()) {
              try {
                await session.bot.deleteMessage(session.channelId, msg.messageId.toString())

                deletedMessages.push({
                  messageId: msg.messageId,
                  userId: msg.userId,
                  content: msg.content || '',
                  timestamp: msg.timestamp,
                  groupId: groupId,
                  deleteTime: Date.now()
                })

                deletedCount++
                console.log(`补充删除消息 ${msg.messageId} 成功`)
                await new Promise(resolve => setTimeout(resolve, 100))
              } catch (error) {
                console.warn(`补充删除消息 ${msg.messageId} 失败:`, error.message || error)
              }
            }

            messageHistory.set(groupId, updatedHistory.filter(msg => msg.userId !== Number(targetUserId)))
          } else {
            console.log(`${targetUserId} 的消息清理完成！`)
          }
        }

        // 保存删除记录到文件
        saveDeletedMessages()
      }

      console.log(`本次清理共删除了 ${deletedCount} 条消息`)
      return true
    } catch (error) {
      console.error('执行消息清理时出错:', error)
      return false
    }
  }

  // 执行kill操作的函数
  const executeKill = async (session: Session, targetUserId: string) => {
    const groupId = session.channelId

    try {
      // 第一步：踢出群成员
      await session.bot.internal.setGroupKick(
        Number(groupId),
        Number(targetUserId),
        false
      )

      // 第二步：删除该用户的消息并保存记录
      const history = messageHistory.get(groupId)
      if (history) {
        const userMessages = history
          .filter(msg => msg.userId === Number(targetUserId))
          .slice(-config.deleteMessageCount)
          .reverse()

        for (const msg of userMessages) {
          try {
            await session.bot.deleteMessage(session.channelId, msg.messageId.toString())

            // 保存被删除的消息到记录中
            deletedMessages.push({
              messageId: msg.messageId,
              userId: msg.userId,
              content: msg.content || '',
              timestamp: msg.timestamp,
              groupId: groupId,
              deleteTime: Date.now()
            })

            await new Promise(resolve => setTimeout(resolve, 150))
          } catch (error) {
            console.warn(`删除消息 ${msg.messageId} 失败:`, error.message || error)
          }
        }

        // 从历史记录中移除该用户的消息
        messageHistory.set(groupId, history.filter(msg => msg.userId !== Number(targetUserId)))

        // 第三步：踢出后检测是否还有遗漏的消息
        await new Promise(resolve => setTimeout(resolve, 2000)) // 等待2秒让可能的新消息到达

        // 重新检查是否有该用户的新消息
        const updatedHistory = messageHistory.get(groupId)
        if (updatedHistory) {
          const remainingMessages = updatedHistory.filter(msg => msg.userId === Number(targetUserId))

          if (remainingMessages.length > 0) {
            console.log(`检测到用户 ${targetUserId} 还有 ${remainingMessages.length} 条遗漏消息，正在清理...`)

            for (const msg of remainingMessages.reverse()) {
              try {
                await session.bot.deleteMessage(session.channelId, msg.messageId.toString())

                // 保存被删除的遗漏消息
                deletedMessages.push({
                  messageId: msg.messageId,
                  userId: msg.userId,
                  content: msg.content || '',
                  timestamp: msg.timestamp,
                  groupId: groupId,
                  deleteTime: Date.now()
                })

                console.log(`补充删除消息 ${msg.messageId} 成功`)
                await new Promise(resolve => setTimeout(resolve, 100))
              } catch (error) {
                console.warn(`补充删除消息 ${msg.messageId} 失败:`, error.message || error)
              }
            }

            // 再次清理历史记录
            messageHistory.set(groupId, updatedHistory.filter(msg => msg.userId !== Number(targetUserId)))
          } else {
            console.log(`${targetUserId} 杀干净了！`)
          }
        }

        // 保存删除记录到文件
        saveDeletedMessages()
      }

      // 第四步：在群里发送执行消息
      await session.send('哎呀骇死我力TwT')

      simulateManualKill(session, targetUserId)

    } catch (error) {
      console.error('执行自动kill时出错:', error)
      return false
    }
  }

  // 监听所有群消息，记录消息ID并检测关键词
  ctx.on('message', async (session) => {
    if (session.platform === 'onebot' && session.channelId && session.messageId) {
      const groupId = session.channelId
      const userId = session.userId
      const messageId = session.messageId
      const content = session.content || ''

      if (!messageHistory.has(groupId)) {
        messageHistory.set(groupId, [])
      }

      const history = messageHistory.get(groupId)!
      history.push({
        messageId: Number(messageId),
        userId: Number(userId),
        timestamp: Date.now(),
        content: content
      })

      // 只保留最近的消息记录，避免内存占用过大
      if (history.length > config.deleteMessageCount * 10) {
        history.splice(0, history.length - config.deleteMessageCount * 5)
      }

      // 检测关键词（仅在群聊中且功能启用时）
      if (session.subtype === 'group' && keywordsConfig.enabled && keywordsConfig.keywords.length > 0) {
        const messageContent = session.content || ''

        // 检查消息是否包含任何关键词
        const containsKeyword = keywordsConfig.keywords.some(keyword =>
          messageContent.includes(keyword)
        )

        if (containsKeyword) {
          // 检查发送者是否为管理员或群主，如果是则不执行kill
          const senderRole = session.author?.roles?.[0]
          if (senderRole !== 'admin' && senderRole !== 'owner') {
            await executeKill(session, userId)
          }
        }
      }
    }
  })

  // 注册kill命令
  ctx.command('kill <target>', '踢出群成员并删除其消息')
    .alias('击杀')
    .action(async ({ session }, target) => {
      // 检查是否为群聊
      if (!session?.channelId || session.subtype !== 'group') {
        return '此命令只能在群聊中使用'
      }

      // 检查发送者权限
      const senderRole = session.author?.roles?.[0]
      if (senderRole !== 'admin' && senderRole !== 'owner') {
        return '你就别玩了喵~'
      }

      // 解析目标用户
      let targetUserId: string | undefined

      if (!target) {
        // 检查消息中是否有@某人
        const atElement = session.elements?.find(el => el.type === 'at')
        if (atElement && atElement.attrs?.id) {
          targetUserId = atElement.attrs.id
        } else {
          return '请@要踢出的用户或在命令后指定用户ID'
        }
      } else {
        // 解析目标参数，可能是用户ID或者包含@的字符串
        if (target.includes('<at id=')) {
          // 从at标签中提取用户ID
          const match = target.match(/id="(\d+)"/);
          if (match) {
            targetUserId = match[1];
          }
        } else {
          // 移除@前缀并提取用户ID
          targetUserId = target.replace(/^@/, '').trim()
        }
      }

      if (!targetUserId) {
        return '你倒是说杀谁啊啊啊啊~'
      }

      // 确保targetUserId是纯数字字符串
      targetUserId = targetUserId.replace(/\D/g, '')
      if (!targetUserId) {
        return 'kill个人可以吗QwQ'
      }

      const groupId = session.channelId

      try {
        // 执行kill操作
        const success = await executeKill(session, targetUserId)

      } catch (error) {
        console.error('执行kill命令时出错:', error)
        return `操作失败: ${error.message || '未知错误'}`
      }
    })

  ctx.command('dellog [count]', '查看最近删除的消息记录')
    .action(async ({ session }, count) => {
      const senderRole = session.author?.roles?.[0]
      if (senderRole !== 'admin' && senderRole !== 'owner') {
        return '你不能看哦，雑魚~'
      }

      const showCount = Math.min(Number(count) || 10, 50)
      const recentDeleted = deletedMessages
        .filter(msg => msg.groupId === session.channelId)
        .slice(-showCount)
        .reverse()

      if (recentDeleted.length === 0) {
        return '我什么都没撤哦~'
      }

      const batchSize = 5
      const batches = []
      for (let i = 0; i < recentDeleted.length; i += batchSize) {
        batches.push(recentDeleted.slice(i, i + batchSize))
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        let result = `最近撤回记录 (${batchIndex + 1}/${batches.length})：\n\n`

        batch.forEach((msg, index) => {
          const globalIndex = batchIndex * batchSize + index + 1
          const deleteDate = new Date(msg.deleteTime).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })

          // 清理和截断消息内容
          let cleanContent = msg.content
            .replace(/\n/g, ' ')
            .replace(/\r/g, '')
            .replace(/[<>]/g, '')
            .trim()

          if (cleanContent.includes('json data=') || cleanContent.includes('forward id=')) {
            cleanContent = '[特殊消息类型]'
          } else if (cleanContent.length > 30) {
            cleanContent = cleanContent.substring(0, 30) + '...'
          }

          if (!cleanContent) {
            cleanContent = '[空消息或媒体消息]'
          }

          result += `${globalIndex}. 用户: ${msg.userId}\n`
          result += `   内容: ${cleanContent}\n`
          result += `   删除时间: ${deleteDate}\n\n`
        })

        try {
          await session.send(result)

          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        } catch (error) {
          console.error('发送dellog消息失败:', error)
          await session.send(`发送记录时出错，请稍后重试`)
          break
        }
      }

      return
    })
}