export interface MailOptions {
    to: string | string[];
    subject: string;
    body?: string;
    template?: string;
    context?: Record<string, any>;
}

export interface IMailProvider {
    send(options: MailOptions): Promise<void>;
}
