export enum QueueNames {
  AUTH = 'auth_queue',
  EMAIL = 'email_queue',
  POST = 'post_queue',
  INTERACTIONS = 'interactions_queue',
}

export enum AuditSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}
