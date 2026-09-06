export enum InteractionJobType {
  POST_LIKED = 'POST_LIKED',
  POST_UNLIKED = 'POST_UNLIKED',
  COMMENT_CREATED = 'COMMENT_CREATED',
  REPLY_CREATED = 'REPLY_CREATED',
  COMMENT_LIKED = 'COMMENT_LIKED',
  COMMENT_UNLIKED = 'COMMENT_UNLIKED',
}

export interface InteractionJobPayload {
  type: InteractionJobType;
  userId: string;
  postId?: string;
  commentId?: string;
  parentCommentId?: string;
}
