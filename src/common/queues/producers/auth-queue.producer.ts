import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '../queues.constants';

@Injectable()
export class AuthQueueProducer {
  constructor(
    @InjectQueue(QueueNames.AUTH) private readonly authQueue: Queue,
  ) {}

  async addLoginHistoryJob(data: {
    userId: string;
    ipAddress: string;
    device?: string;
    loginMethod: string;
  }) {
    await this.authQueue.add('login_history', data, {
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async addAuditLogJob(data: {
    userId: string;
    action: string;
    status: string;
    severity: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }) {
    await this.authQueue.add('audit_log', data, {
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
