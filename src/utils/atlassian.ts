/**
 * @module atlassian
 * @description Atlassian Confluence API client
 * @see {@link https://developer.atlassian.com/cloud/confluence/rest/v2/intro/}
 */

import logger from './logger.ts'
import { dedent } from '@qnighy/dedent'
import { getAppConfig } from '../config.ts'

/**
 * Structure for pagination response links
 */
interface PaginationLinks {
  next?: string
}

/**
 * Structure for Atlassian API response
 */
interface AtlassianApiResponse {
  results: unknown[]
  _links: PaginationLinks
}

/**
 * Confluence space object structure
 */
export interface Space {
  id: string
  key: string
  name: string
  type: string
  status: string
  _links: {
    webui: string
    [key: string]: string
  }
}

/**
 * Confluence page object structure
 */
export interface Page {
  id: string
  title: string
  status: string
  spaceId: string
  parentId?: string
  authorId: string
  createdAt: string
  version: {
    number: number
    message?: string
    createdAt: string
    authorId: string
  }
  _links: {
    webui: string
    [key: string]: string
  }
}

/**
 * CQL search result
 */
export interface SearchResult {
  content: {
    id: string
    type: string
    status: string
    title: string
    spaceId: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Current user information
 */
export interface CurrentUser {
  accountId: string
  accountType: string
  email?: string
  publicName: string
  displayName?: string
  isExternalCollaborator?: boolean
  _links: {
    [key: string]: string
  }
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean
  user?: CurrentUser
  error?: string
  message: string
}

/**
 * Atlassian API client configuration
 */
export interface AtlassianClientOptions {
  baseUrl?: string
  apiToken?: string
  debug?: boolean
}

/**
 * Atlassian API interface
 */
interface AtlassianApi {
  /**
   * Search Confluence content
   */
  searchConfluence(query: string, limit?: number): Promise<AtlassianApiResponse>

  /**
   * Get a specific Confluence page by ID
   */
  getConfluencePage(pageId: string): Promise<unknown>

  /**
   * Search Jira issues
   */
  searchJira(jql: string, limit?: number): Promise<AtlassianApiResponse>

  /**
   * Get a Jira issue by key
   */
  getJiraIssue(issueKey: string): Promise<unknown>

  /**
   * Validate the API token
   */
  validateToken(): Promise<TokenValidationResult>

  /**
   * Get all Confluence spaces
   */
  getSpaces(): Promise<Space[]>
}

/**
 * Create an Atlassian API client
 */
export async function createClient(
  options?: AtlassianClientOptions,
): Promise<AtlassianApi> {
  const config = await getAppConfig()

  let baseUrl = options?.baseUrl || config.ATLASSIAN_URL || ''
  const apiToken = options?.apiToken || config.ATLASSIAN_API_TOKEN || ''

  // Debug info - log partial credentials to help troubleshoot
  if (options?.debug || config.DEBUG) {
    if (baseUrl) {
      const maskedUrl = baseUrl
      logger.debug(`Using Atlassian base URL: ${maskedUrl}`)
    } else {
      logger.debug('No Atlassian base URL provided')
    }

    if (apiToken) {
      const tokenPrefix = apiToken.substring(0, 4)
      const tokenSuffix = apiToken.substring(apiToken.length - 4)
      logger.debug(`Using Atlassian API token: ${tokenPrefix}...${tokenSuffix}`)
    } else {
      logger.debug('No Atlassian API token provided')
    }
  }

  // Remove any trailing slashes from base URL
  baseUrl = baseUrl.replace(/\/+$/, '')

  // Validate credentials
  if (!baseUrl) {
    throw new Error(
      dedent`
      No Atlassian base URL provided.
      Please set the ATLASSIAN_URL environment variable or provide it in the options.
      Example: https://your-domain.atlassian.net
      `,
    )
  }

  if (!apiToken) {
    throw new Error(
      dedent`
      No Atlassian API token provided.
      Please set the ATLASSIAN_API_TOKEN environment variable or provide it in the options.
      You can create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens
      `,
    )
  }

  /**
   * Make a request to the Atlassian API
   */
  async function makeRequest(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<Response> {
    const url = `${baseUrl}${path}`
    const headers = {
      Authorization: `Basic ${
        btoa(`${config.ATLASSIAN_EMAIL || ''}:${apiToken}`)
      }`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    return fetch(url, options)
  }

  // Implement the API interface
  return {
    async searchConfluence(
      query: string,
      limit = 10,
    ): Promise<AtlassianApiResponse> {
      const path = `/wiki/rest/api/content/search?cql=${
        encodeURIComponent(query)
      }&limit=${limit}&expand=body.view`
      const response = await makeRequest(path)

      if (!response.ok) {
        throw new Error(
          `Confluence search failed: ${response.status} ${response.statusText}`,
        )
      }

      return await response.json() as AtlassianApiResponse
    },

    async getConfluencePage(pageId: string): Promise<unknown> {
      const path = `/wiki/rest/api/content/${pageId}?expand=body.view,version`
      const response = await makeRequest(path)

      if (!response.ok) {
        throw new Error(
          `Failed to get Confluence page: ${response.status} ${response.statusText}`,
        )
      }

      return await response.json()
    },

    async searchJira(jql: string, limit = 10): Promise<AtlassianApiResponse> {
      const path = '/rest/api/2/search'
      const body = {
        jql,
        maxResults: limit,
        fields: [
          'summary',
          'description',
          'issuetype',
          'priority',
          'status',
          'created',
          'updated',
        ],
      }

      const response = await makeRequest(path, 'POST', body)

      if (!response.ok) {
        throw new Error(
          `Jira search failed: ${response.status} ${response.statusText}`,
        )
      }

      return await response.json() as AtlassianApiResponse
    },

    async getJiraIssue(issueKey: string): Promise<unknown> {
      const path = `/rest/api/2/issue/${issueKey}`
      const response = await makeRequest(path)

      if (!response.ok) {
        throw new Error(
          `Failed to get Jira issue: ${response.status} ${response.statusText}`,
        )
      }

      return await response.json()
    },

    async validateToken(): Promise<TokenValidationResult> {
      try {
        // Use the current user endpoint to validate the token
        const response = await makeRequest('/rest/api/3/myself')

        if (response.ok) {
          const user = await response.json() as CurrentUser
          return {
            valid: true,
            user,
            message: 'Authentication successful',
          }
        }

        const error = await response.text()
        return {
          valid: false,
          message:
            `Authentication failed: ${response.status} ${response.statusText}`,
          error,
        }
      } catch (error) {
        return {
          valid: false,
          message: 'Authentication failed',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },

    async getSpaces(): Promise<Space[]> {
      try {
        const response = await makeRequest('/wiki/rest/api/space')

        if (!response.ok) {
          throw new Error(
            `Failed to get spaces: ${response.status} ${response.statusText}`,
          )
        }

        const data = await response.json() as AtlassianApiResponse
        return data.results as Space[]
      } catch (error) {
        logger.error('Error fetching spaces:', error)
        throw error
      }
    },
  }
}

/**
 * Create and export a default client function
 */
export default createClient
