import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '../queues.constants';
import { OtpEmailJobPayload } from '../types/email.type';

@Injectable()
export class EmailQueueProducer {
  constructor(
    @InjectQueue(QueueNames.EMAIL) private readonly emailQueue: Queue,
  ) {}

  async addOtpEmailJob(data: OtpEmailJobPayload) {
    await this.emailQueue.add('otp_email', data, {
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
