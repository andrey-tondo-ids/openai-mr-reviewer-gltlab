import {
  getBooleanInput,
  getInput,
  getMultilineInput,
  setFailed,
  warning
} from '@actions/core'

function formatError(module: string, context: Record<string, any>, error: any): string {
  let contextStr = Object.entries(context)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 100) : JSON.stringify(v)}`)
    .join(', ')
  if (error instanceof Error) {
    return `[${module}] ${contextStr} | ${error.message}, backtrace: ${error.stack}`
  } else {
    return `[${module}] ${contextStr} | ${error}`
  }
}
import {Bot} from './bot.js'
import {OpenAIOptions, Options} from './options.js'
import {Prompts} from './prompts.js'
import {codeReview} from './review.js'
import {handleReviewComment} from './review-comment.js'

async function run(): Promise<void> {
  const options: Options = new Options(
    getBooleanInput('debug'),
    getBooleanInput('disable_review'),
    getBooleanInput('disable_release_notes'),
    getInput('max_files'),
    getBooleanInput('review_simple_changes'),
    getBooleanInput('review_comment_lgtm'),
    getMultilineInput('path_filters'),
    getInput('system_message'),
    getInput('openai_light_model'),
    getInput('openai_heavy_model'),
    getInput('openai_model_temperature'),
    getInput('openai_retries'),
    getInput('openai_timeout_ms'),
    getInput('openai_concurrency_limit'),
    getInput('openai_base_url')
  )

  // print options
  options.print()

  const prompts: Prompts = new Prompts(
    getInput('summarize'),
    getInput('summarize_release_notes')
  )

  // Create two bots, one for summary and one for review

  let lightBot: Bot | null = null
  try {
    lightBot = new Bot(
      options,
      new OpenAIOptions(options.openaiLightModel, options.lightTokenLimits)
    )
  } catch (e: any) {
    warning(formatError('main.ts:summary-bot', {model: options.openaiLightModel}, e))
    return
  }

  let heavyBot: Bot | null = null
  try {
    heavyBot = new Bot(
      options,
      new OpenAIOptions(options.openaiHeavyModel, options.heavyTokenLimits)
    )
  } catch (e: any) {
    warning(formatError('main.ts:review-bot', {model: options.openaiHeavyModel}, e))
    return
  }

  try {
    // check if the event is pull_request
    if (
      process.env.GITHUB_EVENT_NAME === 'pull_request' ||
      process.env.GITHUB_EVENT_NAME === 'pull_request_target'
    ) {
      await codeReview(lightBot, heavyBot, options, prompts)
    } else if (
      process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment'
    ) {
      await handleReviewComment(heavyBot, options, prompts)
    } else {
      warning('Skipped: this action only works on push events or pull_request')
    }
  } catch (e: any) {
    setFailed(formatError('main.ts:run', {event: process.env.GITHUB_EVENT_NAME}, e))
  }
}


process
  .on('unhandledRejection', (reason, p) => {
    warning(formatError('main.ts:unhandledRejection', {promise: p}, reason))
  })
  .on('uncaughtException', (e: any) => {
    warning(formatError('main.ts:uncaughtException', {}, e))
  })

await run()
