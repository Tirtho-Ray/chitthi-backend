import { Injectable, Logger, Inject } from '@nestjs/common';
import type { IMailProvider, MailOptions } from './interface/mail-provider.interface';
import * as ejs from 'ejs';
import * as path from 'path';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly templateDir = path.resolve(__dirname, 'templates');

    constructor(
        @Inject('MAIL_PROVIDER') private readonly provider: IMailProvider,
    ) { }

    async sendMail(options: MailOptions): Promise<void> {
        try {
            if (options.template) {
                const templatePath = path.join(this.templateDir, `${options.template}.ejs`);
                options.body = await ejs.renderFile(templatePath, options.context || {});
            }

            if (!options.body) {
                throw new Error('Mail body or template is required');
            }

            await this.provider.send(options);
            this.logger.log(`Email sent successfully to: ${options.to}`);
        } catch (err) {
            this.logger.error(`Mail delivery failed to ${options.to}: ${(err as Error).message}`);
            throw err;
        }
    }
}
