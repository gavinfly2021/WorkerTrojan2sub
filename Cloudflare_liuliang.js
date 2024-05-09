// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: cloud;

let title = 'CloudFlare'
// 总量(免费账号为 100,000)
let total = 100000
// 如果知道就填上 不知道就会自动取 懒得做缓存了
let accountId = '40a9cb6575b60f64f3f397baf6b05c4e'
// 默认取第几项账号
const accountIndex = 0
// 账号
const email = 'gavin8857@gmail.com'
// API key
const key = 'bc638ffbc3fe16388aca041d45bc603a1a23b'
// pages 项目名
const projectName = 'DateSY'

const now = new Date()
now.setUTCHours(0, 0, 0, 0)
const startDate = now.toISOString()
const endDate = new Date().toISOString()

if (!accountId) {
  accountId = await getAccountId()
}
const scriptName = await getProductionScriptName()
const data = await getInvocations()

const { pagesSum = 0, workersSum = 0 } = await getSum()

let widget = new ListWidget()
const stack = widget.addStack()
stack.layoutHorizontally()
stack.centerAlignContent()
const icon = SFSymbol.named("cloud.fill")
icon.applyFont(Font.boldSystemFont(12)) 
const iconImage = stack.addImage(icon.image) 
iconImage.tintColor = Color.dynamic(new Color("#666666"), Color.white()) // 不喜欢灰色改为彩色 #F4811F
iconImage.imageSize = new Size(18, 18) 
stack.addSpacer(2) 
const t = stack.addText(title)
t.font = Font.boldSystemFont(16);
t.textColor = Color.dynamic(new Color("#666666"), Color.white())
t.centerAlignText()
widget.addSpacer(10)

const metricStack = widget.addStack()
metricStack.layoutHorizontally()

addMetric('Pages', pagesSum.toLocaleString(), metricStack, 12, 18)
metricStack.addSpacer(14)
addMetric('Workers', workersSum.toLocaleString(), metricStack, 12, 18)
widget.addSpacer(5)
addMetric('今日剩余', (total - pagesSum - workersSum).toLocaleString(), widget, 12, 32)
Script.setWidget(widget)
if (!config.runsInWidget) {
  await widget.presentSmall()
}
Script.complete()

async function getAccountId() {
  const req = new Request(`https://api.cloudflare.com/client/v4/accounts`)
  req.method = 'GET'
  req.headers = {
    'content-type': 'application/json',
    'X-AUTH-EMAIL': email,
    'X-AUTH-KEY': key,
  }
  const res = await req.loadJSON()
  // console.log(res)
  const name = res?.result?.[accountIndex]?.name
  const id = res?.result?.[accountIndex]?.id
  console.log(`默认取第 ${accountIndex} 项\n名称: ${name}, 账号 ID: ${id}`)
  if (!id) throw new Error('找不到账号 ID')
  return id
}
async function getProductionScriptName() {
  const req = new Request(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`
  )
  req.method = 'GET'
  req.headers = {
    'content-type': 'application/json',
    'X-AUTH-EMAIL': email,
    'X-AUTH-KEY': key,
  }
  const res = await req.loadJSON()
  // console.log(res)
  const name = res?.result?.production_script_name
  console.log(`脚本名称: ${name}`)
  if (!name) throw new Error('找不到脚本名称')
  return name
}
async function getInvocations() {
  const req = new Request(`https://api.cloudflare.com/client/v4/graphql`)
  req.method = 'POST'
  req.headers = {
    'content-type': 'application/json',
    'X-AUTH-EMAIL': email,
    'X-AUTH-KEY': key,
  }
  req.body = JSON.stringify({
    query: `query getPagesProjectAnalytics_minute($accountId: string, $scriptName: string, $startDate: string, $endDate: string) {
    viewer {
      accounts(filter: {accountTag: $accountId}) {
        invocations: pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $startDate, datetime_lt: $endDate, scriptName: $scriptName}) {
          dimensions {
            datetimeMinute
          }
          sum {
            requests
          }
        }
      }
    }
  }`,
    variables: {
      accountId,
      scriptName,
      startDate,
      endDate,
    },
  })
  const res = await req.loadJSON()
  // console.log(res)
  const invocations = res?.data?.viewer?.accounts?.[accountIndex]?.invocations
  console.log(`范围: ${startDate} ~ ${endDate}\n默认取第 ${accountIndex} 项`)
  if (!invocations) throw new Error('找不到数据')
  return invocations.map(i => i?.sum?.requests)
}
async function getSum() {
  const req = new Request(`https://api.cloudflare.com/client/v4/graphql`)
  req.method = 'POST'
  req.headers = {
    'content-type': 'application/json',
    'X-AUTH-EMAIL': email,
    'X-AUTH-KEY': key,
  }
  req.body = JSON.stringify({
    query: `query getBillingMetrics($accountId: string!, $filter: AccountWorkersInvocationsAdaptiveFilter_InputObject) {
      viewer {
        accounts(filter: {accountTag: $accountId}) {
          pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: $filter) {
            sum {
              requests
            }
          }
          workersInvocationsAdaptive(limit: 10000, filter: $filter) {
            sum {
              requests
            }
          }
        }
      }
    }`,
    variables: {
      accountId,
      filter:{ datetime_geq: startDate, datetime_leq: endDate}
    },
  })
  const res = await req.loadJSON()
  // console.log(res)
  const pagesFunctionsInvocationsAdaptiveGroups = res?.data?.viewer?.accounts?.[accountIndex]?.pagesFunctionsInvocationsAdaptiveGroups
  const workersInvocationsAdaptive = res?.data?.viewer?.accounts?.[accountIndex]?.workersInvocationsAdaptive
  if (!pagesFunctionsInvocationsAdaptiveGroups && !workersInvocationsAdaptive) throw new Error('找不到数据')
  const pagesSum = pagesFunctionsInvocationsAdaptiveGroups.reduce((a, b) => a + b?.sum.requests, 0) 
  const workersSum = workersInvocationsAdaptive.reduce((a, b) => a + b?.sum.requests, 0) 
  console.log(`范围: ${startDate} ~ ${endDate}\n默认取第 ${accountIndex} 项`)
  
  return { pagesSum, workersSum }
}

function addMetric(title, value, parentStack, titleFontSize = 12, valueFontSize = 12, color = '#07e092') {
    const stack = parentStack.addStack()
    stack.layoutVertically()
    const titleLabel = stack.addText(title)
    titleLabel.font = Font.systemFont(titleFontSize)
    const valueLabel = stack.addText(value)
    valueLabel.font = Font.systemFont(valueFontSize)
    valueLabel.textColor = new Color(color)
  }
