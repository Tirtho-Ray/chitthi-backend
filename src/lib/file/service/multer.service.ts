import { Injectable, BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';
import { FileType } from '../utils/file-type.enum';

@Injectable()
export class MulterService {
  private readonly mimeTypesMap: Record<
    Exclude<FileType, FileType.any>,
    string[]
  > = {
    [FileType.image]: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ],
    [FileType.document]: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ],
    [FileType.video]: [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
    ],
    [FileType.audio]: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac'],
  };

  private fileFilter(fileType: FileType, customMimeTypes?: string[]) {
    const allowed =
      fileType === FileType.any
        ? null
        : customMimeTypes || this.mimeTypesMap[fileType];

    return (req, file, cb) => {
      if (!allowed || allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(`Unsupported file type: ${file.mimetype}`),
          false,
        );
      }
    };
  }

  singleUpload(
    fileType: FileType = FileType.image,
    fileSizeLimit = 10 * 1024 * 1024,
    customMimeTypes?: string[],
  ): MulterOptions {
    return {
      storage: memoryStorage(),
      limits: { fileSize: fileSizeLimit },
      fileFilter: this.fileFilter(fileType, customMimeTypes),
    };
  }

  multipleUpload(
    maxFiles = 5,
    fileType: FileType = FileType.any,
    fileSizeLimit = 10 * 1024 * 1024,
    customMimeTypes?: string[],
  ): MulterOptions {
    return {
      storage: memoryStorage(),
      limits: {
        fileSize: fileSizeLimit,
        files: maxFiles,
      },
      fileFilter: this.fileFilter(fileType, customMimeTypes),
    };
  }
}
