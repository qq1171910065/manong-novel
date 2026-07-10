import { describe, expect, it } from 'vitest'
import {
  parseMaterializePayloadRobust,
  salvageCharactersFromBrokenJson,
} from './section-polish-materialize-parse'

describe('parseMaterializePayloadRobust', () => {
  it('解析标准角色 JSON', () => {
    const raw = JSON.stringify({
      summary: '新增2位角色',
      affected_sections: ['characters'],
      blueprint_updates: {
        characters: [
          {
            name: '林婉儿',
            identity: '师妹',
            personality: '外冷内热',
            goals: '守护主角',
            abilities: '剑术',
            relationship_to_protagonist: '青梅竹马',
            description: '气质清冷。',
          },
        ],
      },
    })
    const parsed = parseMaterializePayloadRobust(raw)
    expect(parsed.parseSource).toBe('json-object')
    expect(parsed.characters).toHaveLength(1)
    expect(parsed.characters[0]?.name).toBe('林婉儿')
  })

  it('从损坏 JSON 中 salvage 角色', () => {
    const raw = `
{
  "summary":生成第13至18位角色",
  "affected_sections": [""],
  blueprint_updates {
    [
      {
        name:"警萱",
        identity:"刚毅女警察",
        personality:"外表强硬",
        relationship_to_protagonist:"执法对抗到臣服",
        description:"身材健美。"
      },
      {
        name:"艺梦",
        identity:"幻术艺术家",
        personality:"浪漫多情",
        description:"窈窕身姿。"
      }
    ]
  }
`
    const salvaged = salvageCharactersFromBrokenJson(raw)
    expect(salvaged.length).toBeGreaterThanOrEqual(1)
    expect(salvaged.some((c) => c.name.includes('警萱') || c.name === '警萱')).toBe(true)
  })

  it('salvage 字段连写、缺引号的 LLM 输出', () => {
    const raw = String.raw`{
  "summary":更新主要角色",
affected_sections [
   characters"
 ],
blueprint_updates {
            name江若琳identity性感拉丁舞者description身材火辣曲线玲珑，蜜色肌肤，长发飘逸，舞姿撩人。",
        "personality":热情奔放主动诱惑",
goals在荒岛释放原始欲望，与主角狂欢abilities顶级舞蹈与身体柔韧性relationship_to_protagonist从伴到床上侣"
      },
 {
name夏梓萱identity知大学教师description优雅，眼镜美女丰满身材散发成熟魅力": "外表端庄，内心饥渴",
       goals探索禁忌快感臣服主角abilities教学与心理诱导技巧relationship_to_protagonist师生式征服对象"
      },
 {
name乔雨薇identity野性空姐description高挑健美短发英气制下藏着曲线。",
personality大胆直率欲强",
        "goals":主导群戏，共享主角宠爱abilities飞行技能与紧急求生relationship_to_protagonist伙伴转岛上女王"
      }
    ]
 }`

    const parsed = parseMaterializePayloadRobust(raw)
    expect(parsed.parseSource).toBe('salvage-regex')
    expect(parsed.characters.length).toBeGreaterThanOrEqual(3)
    expect(parsed.characters.map((c) => c.name)).toContain('江若琳')
    expect(parsed.characters.map((c) => c.name)).toContain('夏梓萱')
    expect(parsed.characters.map((c) => c.name)).toContain('乔雨薇')
  })
})

describe('parseCharacterBatchIntent batch size', () => {
  it('18 位默认每批 3 个', async () => {
    const { parseCharacterBatchIntent, buildCharacterBatchRanges } = await import('./section-polish-batch')
    const intent = parseCharacterBatchIntent('根据设定重新设计18位美女角色')
    expect(intent.batchSize).toBe(2)
    expect(buildCharacterBatchRanges(18, intent.batchSize)).toHaveLength(9)
  })
})
