import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { IMailProvider, MailOptions } from '../interface/mail-provider.interface';

export class AwsSesProvider implements IMailProvider {
    private client: SESClient;

    constructor(private readonly configService: ConfigService) {
        this.client = new SESClient({
            region: this.configService.get<string>('mail.AWS_REGION', 'us-east-1'),
            credentials: {
                accessKeyId: this.configService.get<string>('mail.AWS_ACCESS_KEY_ID', ''),
                secretAccessKey: this.configService.get<string>('mail.AWS_SECRET_ACCESS_KEY', ''),
            },
        });
    }

    async send(options: MailOptions): Promise<void> {
        const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
        // Generate plaintext fallback by stripping HTML tags for better spam scores
        const textFallback = options.body ? options.body.replace(/<[^>]*>?/gm, '') : '';

        const command = new SendEmailCommand({
            Destination: {
                ToAddresses: toAddresses,
            },
            Message: {
                Body: {
                    Html: { Data: options.body },
                    Text: { Data: textFallback },
                },
                Subject: { Data: options.subject },
            },
            Source: this.configService.get<string>('mail.MAIL_FROM', ''),
        });

        await this.client.send(command);
    }
}
