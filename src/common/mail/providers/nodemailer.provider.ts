import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { IMailProvider, MailOptions } from '../interface/mail-provider.interface';

export class NodemailerProvider implements IMailProvider {
    private transporter: nodemailer.Transporter;

    constructor(private readonly configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('mail.MAIL_HOST'),
            port: this.configService.get<number>('mail.MAIL_PORT'),
            secure: this.configService.get<number>('mail.MAIL_PORT') === 465,
            auth: {
                user: this.configService.get<string>('mail.MAIL_USER'),
                pass: this.configService.get<string>('mail.MAIL_PASS'),
            },
        });
    }

    async send(options: MailOptions): Promise<void> {
        await this.transporter.sendMail({
            from: this.configService.get<string>('mail.MAIL_FROM'),
            to: options.to,
            subject: options.subject,
            html: options.body,
        });
    }
}
