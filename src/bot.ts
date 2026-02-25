
import {info, setFailed, warning} from './gitlab-core.js'
import { OpenAI } from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat'
import pRetry from 'p-retry'
import {OpenAIOptions, Options} from './options.js'


// define type to save parentMessageId and conversationId
// For OpenAI SDK, we don't need parentMessageId/conversationId, but keep for compatibility
export interface Ids {
  parentMessageId?: string
  conversationId?: string
}

export class Bot {
  private readonly api: OpenAI | null = null
  private readonly options: Options
  private model: string
  private temperature: number
  private maxTokens: number


  constructor(options: Options, openaiOptions: OpenAIOptions) {
    this.options = options
    if (process.env.OPENAI_API_KEY) {
      this.api = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        organization: process.env.OPENAI_API_ORG ?? undefined,
        baseURL: options.apiBaseUrl
      })
      this.model = openaiOptions.model
      this.temperature = options.openaiModelTemperature
      this.maxTokens = openaiOptions.tokenLimits.responseTokens
    } else {
      throw new Error("Unable to initialize the OpenAI API, 'OPENAI_API_KEY' environment variable is not available")
    }
  }


  chat = async (message: string, _ids: Ids): Promise<[string, Ids]> => {
    // _ids is ignored, as OpenAI SDK does not use conversation IDs for completions
    if (!this.api) {
      setFailed('The OpenAI API is not initialized')
      return ['', {}]
    }
    try {
      const start = Date.now()
      const systemMessage = this.options.systemMessage
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: message }
      ]
      const response = await this.api.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        // timeout is not a direct param in openai SDK, so we skip it here
      })
      const end = Date.now()
      info(`openai chat.completions.create response time: ${end - start} ms`)
      const responseText = response.choices?.[0]?.message?.content ?? ''
      if (this.options.debug) {
        info(`openai responses: ${responseText}`)
      }
      return [responseText, {}]
    } catch (e: any) {
      warning(`Failed to chat: ${e}, backtrace: ${e.stack}`)
      return ['', {}]
    }
  }

}
