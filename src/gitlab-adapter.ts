/* eslint-disable eslint-comments/no-use */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */

import gitlabENV from 'gitlab-ci-env'
import type {MergeRequestDiscussionNotePositionOptions} from '@gitbeaker/rest'
import {Gitlab} from '@gitbeaker/rest'

const api = new Gitlab({
  host: process.env.GITLAB_HOST,
  token: process.env.GITLAB_PERSONAL_TOKEN || ''
})

interface DiscussionNotePositionBaseSchema extends Record<string, unknown> {
  base_sha: string
  start_sha: string
  head_sha: string
  position_type: 'text' | 'image'
  old_path?: string
  new_path?: string
}
type DiscussionNotePositionTextSchema = DiscussionNotePositionBaseSchema & {
  position_type: 'text'
  new_line?: string
  old_line?: string
  line_range?: {
    start?: Record<string, unknown>
    end?: Record<string, unknown>
  }
}

interface IBaseParams {
  owner?: string
  repo?: string
}

interface IPageParams extends IBaseParams {
  page: number
  per_page: number
}

interface ICompare {
  base: string
  head: string
}

interface IContent {
  path: string
  ref: string
}

interface IContent {
  path: string
  ref: string
}

interface IUpdateComment extends IBaseParams {
  comment_id: number
  body: string
}

interface ICreateReviewComment extends IBaseParams {
  pull_number: number
  commit_id: string
  body: string
  path: string
  line: number
  start_side?: 'LEFT' | 'RIGHT'
  start_line?: number
}

export const octokit = {
  repos: {
    async compareCommits({base, head}: ICompare & IBaseParams) {
      try {
        const res = await api.Repositories.compare(
          gitlabENV.ci.project.id,
          base,
          head
        )
        return {
          data: {
            files: res.diffs?.map(e => ({
              ...e,
              filename: e.new_path,
              patch: e.diff
            })),
            commits: res.commits?.map(e => ({
              ...e,
              sha: e.id
            }))
          }
        }
      } catch (error) {
        console.error('[octokit.repos.compareCommits] Error:', {base, head, error})
        throw error
      }
    },
    async getContent({path, ref}: IBaseParams & IContent) {
      try {
        const res = await api.RepositoryFiles.show(
          gitlabENV.ci.project.id,
          path,
          ref
        )
        return {
          data: {...res, type: 'file'}
        }
      } catch (error) {
        console.error('[octokit.repos.getContent] Error:', {path, ref, error})
        throw error
      }
    }
  },
  pulls: {
    async get({pull_number}: IBaseParams & {pull_number: number}) {
      try {
        const res = await api.MergeRequests.show(
          gitlabENV.ci.project.id,
          pull_number
        )
        return {
          data: {
            ...res,
            body: res.description
          }
        }
      } catch (error) {
        console.error('[octokit.pulls.get] Error:', {pull_number, error})
        throw error
      }
    },
    async update({
      pull_number,
      body
    }: IBaseParams & {pull_number: number; body: string}) {
      try {
        console.log('update desc:', body)
        const res = await api.MergeRequests.edit(
          gitlabENV.ci.project.id,
          pull_number,
          {description: body}
        )
        return {
          data: res
        }
      } catch (error) {
        console.error('[octokit.pulls.update] Error:', {pull_number, body, error})
        throw error
      }
    },
    async updateReviewComment({comment_id, body}: IUpdateComment) {
      try {
        console.log('update ReviewComment:', body)
        const res = await api.MergeRequestNotes.edit(
          gitlabENV.ci.project.id,
          context.payload.pull_request.number,
          comment_id,
          {body}
        )
        return {
          data: res
        }
      } catch (error) {
        console.error('[octokit.pulls.updateReviewComment] Error:', {comment_id, body, error})
        throw error
      }
    },
    // use for create file changes comment
    async createReviewComment({
      pull_number,
      commit_id,
      body,
      path,
      line: end_line,
      start_line // maybe undefined
    }: ICreateReviewComment) {
      const line_range = start_line ? end_line - start_line + 1 : 1
      const content = start_line
        ? body.replace(
            /```suggestion\s/,
            '```suggestion:-' + line_range + '+0\n'
          )
        : body
      const opts = Object.assign(
        {
          commitId: commit_id
        },
        {
          position: Object.assign(
            {
              baseSha: context.payload.pull_request.base.sha,
              startSha: context.payload.pull_request.base.sha,
              headSha: context.payload.pull_request.head.sha,
              positionType: 'text',
              newLine: end_line.toString(),
              newPath: path.toString()
            } as MergeRequestDiscussionNotePositionOptions,
            start_line
              ? {
                  lineRange: {
                    start: {
                      type: 'new',
                      lineCode: start_line.toString()
                    },
                    end: {
                      type: 'new',
                      lineCode: end_line.toString()
                    }
                  }
                }
              : {}
          )
        }
      )
      console.log('createReviewComment:', content)
      const res = await api.MergeRequestDiscussions.create(
        gitlabENV.ci.project.id,
        pull_number,
        content,
        opts
      )
      return {data: res}
    },

    async createReplyForReviewComment(...args: any[]) {
      console.log('pulls createReplyForReviewComment')
      return {}
    },

    async listReviewComments({
      pull_number,
      page = 1,
      per_page = 100
    }: {pull_number: number, page?: number, per_page?: number}) {
      const res = await api.MergeRequestDiscussions.all(
        gitlabENV.ci.project.id,
        pull_number,
        {page, perPage: per_page}
      )
      const data: any[] = []
      res.forEach(e => {
        e.notes
          ?.filter(e => !e?.system)
          .forEach((note, index, arr) => {
            const position = note.position as DiscussionNotePositionTextSchema
            const start_line = (position?.line_range?.start?.new_line ||
              position?.line_range?.start?.line_code ||
              position?.new_line) as string
            const end_line = (position?.line_range?.end?.new_line ||
              position?.line_range?.end?.line_code ||
              position?.new_line) as string
            data.push({
              ...note,
              path: position?.new_path,
              start_line: parseInt(start_line || '0'),
              line: parseInt(end_line || '0'),
              in_reply_to_id: index === 0 ? null : arr[0].id,
              user: {...note.author, login: note.author.name}
            })
          })
      })

      return {
        data
      }
    },

    async listCommits({page = 1, issue_number}: {page?: number, issue_number: number}) {
      const res = await api.MergeRequests.allCommits(
        gitlabENV.ci.project.id,
        parseInt(gitlabENV.ci.mergeRequest.iid)
      )
      if (page > 1) return {data: []}
      return {data: res.map(e => ({...e, sha: e.id}))}
    }
  },
  issues: {
    async createComment({
      issue_number,
      body
    }: IBaseParams & {issue_number: number; body: string}) {
      console.log('issue.createComment:', body)
      const res = await api.MergeRequestNotes.create(
        gitlabENV.ci.project.id,
        issue_number,
        body
      )
      return {
        data: res
      }
    },
    // use for update Summary of Changes
    async updateComment({comment_id, body}: IUpdateComment) {
      console.log('issue.updateComment:', body)
      const res = await api.MergeRequestNotes.edit(
        gitlabENV.ci.project.id,
        context.payload.pull_request.number,
        comment_id,
        {body}
      )
      return {
        data: res
      }
    },
    async listComments({
      issue_number,
      page = 1,
      per_page = 100
    }: {issue_number: number, page?: number, per_page?: number}) {
      // this notes will include all notes
      return octokit.pulls.listReviewComments({
        pull_number: issue_number,
        per_page,
        page
      })
    }
  }
}

export const context = {
  eventName: process.env.GITHUB_EVENT_NAME,
  repo: {
    // @ts-ignore
    owner: gitlabENV.ci.project.path?.match(/^(.+)\/([^/]+)$/)[1],
    repo: gitlabENV.ci.project.name
  },
  // payload from process.env.GITHUB_EVENT_PATH
  payload: {
    repository: {
      full_name: gitlabENV.ci.project.path,
      name: gitlabENV.ci.project.name,
      owner: {
        login: gitlabENV.ci.project.rootNamespace // TODO: it's may be wrong for name
      }
    },
    pull_request: {
      title: gitlabENV.ci.mergeRequest.title,
      number: parseInt(gitlabENV.ci.mergeRequest.iid, 10),
      body: null as null | string,
      base: {
        sha: gitlabENV.ci.mergeRequest.diff.baseSha
      },
      head: {
        sha: gitlabENV.ci.commit.sha
      }
    },
    issue: null,
    // {
    //   number: null // maybe it's the issue count number
    // },
    comment: '', // for review comment
    action: 'created' // hardcode
  }
}

export const setMRBody = async () => {
  const pr = await octokit.pulls.get({
    pull_number: context.payload.pull_request.number
  })
  if (pr.data.body) {
    context.payload.pull_request.body = pr.data.body
  }
}
