import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailProviderFactory } from './provider.factory';


@Module({
    imports: [ConfigModule],
    providers: [
        MailService,
        {
            provide: 'MAIL_PROVIDER',
            useFactory: (configService: ConfigService) => {
                const driver = configService.get<string>('mail.MAIL_DRIVER') || 'nodemailer';
                return MailProviderFactory.create(driver, configService);
            },
            inject: [ConfigService],
        },
    ],
    exports: [MailService]
})
export class MailModule { }