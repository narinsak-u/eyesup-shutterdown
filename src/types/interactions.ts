/** A normalized comment returned by the interaction service. */
export interface InteractionComment {
  id: string
  photoId: string
  ipHash: string
  text: string
  createdAt: string
  status: 'visible' | 'pending'
}

/** The current like and comment state for one gallery photo. */
export interface InteractionSummary {
  likeCount: number
  likedByViewer: boolean
  /** Contentful entry ID used to remove the viewer's like. */
  viewerLikeId?: string
  comments: InteractionComment[]
  hasMoreComments: boolean
}

/** Browser-exposed configuration for the isolated interaction Contentful space. */
export interface InteractionConfig {
  space: string
  environment: string
  accessToken: string
  ipDiscoveryUrl: string
}
