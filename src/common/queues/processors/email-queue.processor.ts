import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailService } from '../../mail/mail.service';
import { QueueNames } from '../queues.constants';
import { OtpEmailJobPayload, OtpType } from '../types/email.type';

@Processor(QueueNames.EMAIL)
export class EmailQueueProcessor extends WorkerHost {
  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<OtpEmailJobPayload>): Promise<void> {
    const { email, otp, type } = job.data;

    let subject = 'Verification Code';
    let template = 'otp';

    if (type === OtpType.REGISTER) {
      subject = 'Welcome! Confirm Your Email';
    } else if (type === OtpType.FORGOT_PASSWORD) {
      subject = 'Reset Your Password';
    }

    await this.mailService.sendMail({
      to: email,
      subject,
      template,
      context: { otp, type: type.toLowerCase() },
    });
  }
}
