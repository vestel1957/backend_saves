import { BadRequestException } from '@nestjs/common';

const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const ALLOWED_DOCUMENT_MIMES = [
  ...ALLOWED_IMAGE_MIMES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export function imageFileFilter(
  _req: any,
  file: { mimetype: string; fieldname: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Solo se permiten imágenes (JPEG, PNG, GIF, WebP)`,
      ),
      false,
    );
  }
  callback(null, true);
}

export function documentFileFilter(
  _req: any,
  file: { mimetype: string; fieldname: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ALLOWED_DOCUMENT_MIMES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Solo se permiten imágenes, PDF, Word y Excel`,
      ),
      false,
    );
  }
  callback(null, true);
}
