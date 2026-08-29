import type {
  InteractionComment,
  InteractionConfig,
  InteractionSummary,
} from '@/types/interactions'

const DELIVERY_API = 'https://cdn.contentful.com'
const MANAGEMENT_API = 'https://api.contentful.com'
const DEFAULT_COMMENT_LIMIT = 5
const MAX_COMMENT_LENGTH = 500

interface ContentfulResponse {
  items?: unknown[]
  total?: unknown
}

interface ContentfulEntry {
  sys?: Record<string, unknown>
  fields?: Record<string, unknown>
}

function getInteractionConfig(): InteractionConfig {
  return {
    space: import.meta.env.VITE_INTERACTION_SPACE as string,
    environment: import.meta.env.VITE_INTERACTION_ENVIRONMENT as string,
    accessToken: import.meta.env.VITE_INTERACTION_ACCESS_TOKEN as string,
    ipDiscoveryUrl: import.meta.env.VITE_IP_DISCOVERY_URL as string,
  }
}

function requireConfig(config: InteractionConfig): void {
  if (!config.space || !config.environment || !config.accessToken) {
    throw new Error('Interaction Contentful configuration is incomplete.')
  }
}

function requireIdentifier(value: string, name: 'photoId' | 'ipHash' | 'entryId'): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
  return value.trim()
}

function normalizePagination(skip: number, limit: number): { skip: number; limit: number } {
  if (!Number.isInteger(skip) || skip < 0) throw new Error('Comment skip must be a non-negative integer.')
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Comment limit must be a positive integer.')
  return { skip, limit }
}

function deliveryEntriesUrl(config: InteractionConfig, query: Record<string, string>): string {
  const url = new URL(
    `/spaces/${encodeURIComponent(config.space)}/environments/${encodeURIComponent(config.environment)}/entries`,
    DELIVERY_API,
  )
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return url.toString()
}

function managementEntryUrl(config: InteractionConfig, entryId?: string): string {
  const suffix = entryId ? `/${encodeURIComponent(entryId)}` : ''
  return `${MANAGEMENT_API}/spaces/${encodeURIComponent(config.space)}/environments/${encodeURIComponent(config.environment)}/entries${suffix}`
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Error('Contentful returned an invalid response.')
  }
}

async function requestDelivery(config: InteractionConfig, query: Record<string, string>): Promise<ContentfulResponse> {
  const response = await fetch(deliveryEntriesUrl(config, query), {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  })
  if (response.ok === false) throw new Error(`Interaction read failed with status ${response.status}.`)
  const payload = await readJson(response)
  if (!payload || typeof payload !== 'object') throw new Error('Contentful returned an invalid response.')
  return payload as ContentfulResponse
}

async function requestManagement(
  config: InteractionConfig,
  entryId: string | undefined,
  options: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${config.accessToken}`)
  headers.set('Content-Type', 'application/vnd.contentful.management.v1+json')
  const response = await fetch(managementEntryUrl(config, entryId), {
    method: options.method ?? 'GET',
    ...options,
    headers,
  })
  if (response.ok === false) throw new Error(`Interaction write failed with status ${response.status}.`)
  if (response.status === 204) return undefined
  return readJson(response)
}

function asEntry(value: unknown): ContentfulEntry {
  return value && typeof value === 'object' ? value as ContentfulEntry : {}
}

function fieldValue(entry: ContentfulEntry, name: string): unknown {
  const value = entry.fields?.[name]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const localized = Object.values(value as Record<string, unknown>)
  return localized[0]
}

function stringField(entry: ContentfulEntry, name: string, fallback = ''): string {
  const value = fieldValue(entry, name)
  return typeof value === 'string' ? value : fallback
}

function normalizeComment(value: unknown, fallback?: Partial<InteractionComment>): InteractionComment {
  const entry = asEntry(value)
  const id = typeof entry.sys?.id === 'string' ? entry.sys.id : fallback?.id ?? ''
  const createdAt = stringField(
    entry,
    'createdAt',
    typeof entry.sys?.createdAt === 'string' ? entry.sys.createdAt : fallback?.createdAt ?? '',
  )
  const status = stringField(entry, 'status', fallback?.status ?? 'visible')

  return {
    id,
    photoId: stringField(entry, 'photoId', fallback?.photoId ?? ''),
    ipHash: stringField(entry, 'ipHash', fallback?.ipHash ?? ''),
    text: stringField(entry, 'text', fallback?.text ?? '').trim(),
    createdAt,
    status: status === 'pending' ? 'pending' : 'visible',
  }
}

function responseItems(response: ContentfulResponse): unknown[] {
  return Array.isArray(response.items) ? response.items : []
}

function responseTotal(response: ContentfulResponse): number {
  return typeof response.total === 'number' && Number.isFinite(response.total) && response.total >= 0
    ? response.total
    : responseItems(response).length
}

/** Reads the current like count, viewer like, and one paginated page of comments. */
export async function fetchInteractionSummary(
  photoId: string,
  ipHash: string,
  skip = 0,
  limit = DEFAULT_COMMENT_LIMIT,
): Promise<InteractionSummary> {
  const normalizedPhotoId = requireIdentifier(photoId, 'photoId')
  const normalizedIpHash = requireIdentifier(ipHash, 'ipHash')
  const pagination = normalizePagination(skip, limit)
  const config = getInteractionConfig()
  requireConfig(config)

  const [likes, viewerLikes, comments] = await Promise.all([
    requestDelivery(config, {
      content_type: 'photoLike',
      'fields.photoId': normalizedPhotoId,
      limit: '1',
      select: 'sys.id',
    }),
    requestDelivery(config, {
      content_type: 'photoLike',
      'fields.photoId': normalizedPhotoId,
      'fields.ipHash': normalizedIpHash,
      limit: '1',
      select: 'sys.id',
    }),
    requestDelivery(config, {
      content_type: 'photoComment',
      'fields.photoId': normalizedPhotoId,
      'fields.status': 'visible',
      order: '-fields.createdAt',
      skip: String(pagination.skip),
      limit: String(pagination.limit),
    }),
  ])

  const commentItems = responseItems(comments)
  const viewerLikeId = asEntry(responseItems(viewerLikes)[0]).sys?.id
  return {
    likeCount: responseTotal(likes),
    likedByViewer: responseTotal(viewerLikes) > 0,
    ...(typeof viewerLikeId === 'string' && viewerLikeId ? { viewerLikeId } : {}),
    comments: commentItems.map((comment) => normalizeComment(comment)),
    hasMoreComments: pagination.skip + commentItems.length < responseTotal(comments),
  }
}

function managementFields(fields: Record<string, string>): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, { 'en-US': value }]),
  )
}

/** Creates a like in the isolated interaction space and returns its Contentful entry ID. */
export async function createLike(photoId: string, ipHash: string): Promise<string> {
  const normalizedPhotoId = requireIdentifier(photoId, 'photoId')
  const normalizedIpHash = requireIdentifier(ipHash, 'ipHash')
  const config = getInteractionConfig()
  requireConfig(config)
  const payload = await requestManagement(config, undefined, {
    method: 'POST',
    headers: {
      'X-Contentful-Content-Type': 'photoLike',
    },
    body: JSON.stringify({
      fields: managementFields({
        photoId: normalizedPhotoId,
        ipHash: normalizedIpHash,
        createdAt: new Date().toISOString(),
      }),
    }),
  })
  const id = asEntry(payload).sys?.id
  if (typeof id !== 'string' || !id) throw new Error('Contentful did not return the new like ID.')
  return id
}

/** Creates a visible, immutable comment in the isolated interaction space. */
export async function createComment(
  photoId: string,
  ipHash: string,
  text: string,
): Promise<InteractionComment> {
  const normalizedPhotoId = requireIdentifier(photoId, 'photoId')
  const normalizedIpHash = requireIdentifier(ipHash, 'ipHash')
  if (typeof text !== 'string') throw new Error('Comment text is required.')
  const normalizedText = text.trim()
  if (!normalizedText) throw new Error('Comment text is required.')
  if (normalizedText.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment text must be ${MAX_COMMENT_LENGTH} characters or fewer.`)
  }
  const createdAt = new Date().toISOString()
  const config = getInteractionConfig()
  requireConfig(config)
  const payload = await requestManagement(config, undefined, {
    method: 'POST',
    headers: {
      'X-Contentful-Content-Type': 'photoComment',
    },
    body: JSON.stringify({
      fields: managementFields({
        photoId: normalizedPhotoId,
        ipHash: normalizedIpHash,
        text: normalizedText,
        createdAt,
        status: 'visible',
      }),
    }),
  })

  return normalizeComment(payload, {
    photoId: normalizedPhotoId,
    ipHash: normalizedIpHash,
    text: normalizedText,
    createdAt,
    status: 'visible',
  })
}

/** Deletes a like after reading its current Contentful version for the required header. */
export async function deleteLike(entryId: string): Promise<void> {
  const normalizedEntryId = requireIdentifier(entryId, 'entryId')
  const config = getInteractionConfig()
  requireConfig(config)
  const entry = asEntry(await requestManagement(config, normalizedEntryId))
  const version = entry.sys?.version ?? entry.sys?.publishedVersion
  if (typeof version !== 'number' && typeof version !== 'string') {
    throw new Error('Contentful did not return a version for the like.')
  }
  await requestManagement(config, normalizedEntryId, {
    method: 'DELETE',
    headers: {
      'X-Contentful-Version': String(version),
    },
  })
}
