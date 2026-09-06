import { Module } from '@nestjs/common';
import { InteractionsController } from './controller/interactions.controller';
import { InteractionsService } from './service/interactions.service';
import { QueuesModule } from '../../common/queues/queues.module';

@Module({
  imports: [QueuesModule],
  controllers: [InteractionsController],
  providers: [InteractionsService],
  exports: [InteractionsService],
})
export class InteractionsModule {}
