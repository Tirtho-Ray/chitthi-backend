import { Global, Module } from '@nestjs/common';
import { MulterService } from './service/multer.service';

@Global()
@Module({
  providers: [MulterService],
  exports: [MulterService],
})
export class FileModule { }
