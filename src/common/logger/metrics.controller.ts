import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';
import { Public } from '../../core/jwt/public.decorator';

@Controller('metrics')
export class MetricsController extends PrometheusController {
  @Public()
  @Get()
  async index(@Res() res: Response) {
    return super.index(res);
  }
}
