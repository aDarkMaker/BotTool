# koishi-plugin-kill

[![npm](https://img.shields.io/npm/v/koishi-plugin-kill?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-kill)

kill Somebody

## 学校新生群最喜欢的一集

### del.json

相当于日志，用来记录 Bot 撤回过哪些内容

```json
{
    "messageId": xxxxx,
    "userId": xxxxxxx,
    "content": "xxx",
    "timestamp": xxxxxxx,
    "groupId": "xxxx",
    "deleteTime": xxx
  }
```

### key.json

```json
{
    "keywords": [
        "xxxx",
        "xxxxx",
        ……
    ],
    "enabled": true,
    "description": "关键词黑名单数据库，当群成员发送包含这些关键词的消息时，会自动执行kill操作"
}
```

用来鉴别是否为广告，包含了一些典中典关键词

### 指令

- kill @xxxx (一键踢出目标并撤回其所有内容)

- dellog (调出删除记录，简易化查看)

### 核心功能

检测到语句中包含关键词，可将该人踢出群聊并撤回其所有内容

- Tips：并未加入黑名单，避免误杀

### 注意

Bot 最少是管理且不能被禁言
