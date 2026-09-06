import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, SwaggerCustomOptions } from '@nestjs/swagger';
import { swaggerCustomCss } from './swagger.css';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('SkillUpBD API Documentation')
    .setDescription(
      'Official API documentation for the SkillUpBD platform. ' +
      'All listed endpoints are publicly accessible for documentation and integration purposes.',
    )
    .setVersion('1.0.0')
    .build();

  const customOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      displayRequestDuration: true,
      defaultModelsExpandDepth: -1,
      syntaxHighlight: { theme: 'monokai' },
    },
    customSiteTitle: 'SkillUpBD API Docs',
    customCss: swaggerCustomCss,
  };

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, customOptions);
}
