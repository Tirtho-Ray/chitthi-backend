import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueNames } from './queues.constants';
import { AuthQueueProducer } from './producers/auth-queue.producer';
import { EmailQueueProducer } from './producers/email-queue.producer';
import { PostQueueProducer } from './producers/post-queue.producer';
import { InteractionQueueProducer } from './producers/interactions-queue.producer';
import { AuthQueueProcessor } from './processors/auth-queue.processor';
import { EmailQueueProcessor } from './processors/email-queue.processor';
import { PostQueueProcessor } from './processors/post-queue.processor';
import { InteractionQueueProcessor } from './processors/interactions-queue.processor';
import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QueueNames.AUTH },
      { name: QueueNames.EMAIL },
      { name: QueueNames.POST },
      { name: QueueNames.INTERACTIONS },
    ),
    MailModule,
    RedisModule,
  ],
  providers: [
    AuthQueueProducer,
    EmailQueueProducer,
    PostQueueProducer,
    InteractionQueueProducer,
    AuthQueueProcessor,
    EmailQueueProcessor,
    PostQueueProcessor,
    InteractionQueueProcessor,
  ],
  exports: [
    AuthQueueProducer,
    EmailQueueProducer,
    PostQueueProducer,
    InteractionQueueProducer,
  ],
})
export class QueuesModule {}
