import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigurationModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AtStrategy } from './core/jwt/at.strategy';
import { RedisModule } from './common/redis/redis.module';
import { FileModule } from './lib/file/file.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { PostModule } from './modules/post/post.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { QueuesModule } from './common/queues/queues.module';
import { LoggerModule } from './common/logger/logger.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    FileModule,
    ConfigurationModule,
    PrismaModule,
    RedisModule,
    LoggerModule,
    AuthModule,
    QueuesModule,
    PostModule,
    InteractionsModule,
  ],
  controllers: [AppController],
  providers: [AppService, AtStrategy],
})
export class AppModule { }
