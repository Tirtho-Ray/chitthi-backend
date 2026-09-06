import { ConfigService } from '@nestjs/config';
import { IMailProvider } from './interface/mail-provider.interface';
import { NodemailerProvider } from './providers/nodemailer.provider';
import { AwsSesProvider } from './providers/aws-ses.provider';

export class MailProviderFactory {
    static create(driver: string, configService: ConfigService): IMailProvider {
        switch (driver) {
            case 'nodemailer':
            case 'gmail':
                return new NodemailerProvider(configService);

            case 'ses':
                return new AwsSesProvider(configService);

            // example:  provider
            // case 'sendgrid':
            //     return new SendGridProvider(configService);

            default:
                throw new Error(
                    `Unsupported mail driver: "${driver}". Supported: nodemailer, ses`,
                );
        }
    }
}
