import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

export type UploadFolder = 'avatars' | 'signatures' | 'documents';

// Magic bytes para validacion de contenido real del archivo
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  'image/gif': [Buffer.from([0x47, 0x49, 0x46, 0x38])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF header
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  'application/msword': [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], // OLE2
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    Buffer.from([0x50, 0x4b, 0x03, 0x04]), // PK (ZIP)
  ],
  'application/vnd.ms-excel': [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], // OLE2
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    Buffer.from([0x50, 0x4b, 0x03, 0x04]), // PK (ZIP)
  ],
};

@Injectable()
export class UploadsService {
  private readonly basePath = path.join(process.cwd(), 'uploads');

  /**
   * Valida que los magic bytes del archivo correspondan al MIME type declarado
   */
  private validateMagicBytes(file: Express.Multer.File): void {
    const expectedSignatures = MAGIC_BYTES[file.mimetype];
    if (!expectedSignatures) {
      return; // Si no tenemos firma para este tipo, confiar en el MIME filter
    }

    const fileHeader = file.buffer.subarray(0, 8);
    const isValid = expectedSignatures.some((sig) =>
      fileHeader.subarray(0, sig.length).equals(sig),
    );

    if (!isValid) {
      throw new BadRequestException(
        `El contenido del archivo no corresponde al tipo declarado (${file.mimetype}). ` +
        'Asegurate de que el archivo no este corrupto o renombrado.',
      );
    }
  }

  /**
   * Guarda un archivo en la carpeta indicada
   * Retorna la ruta relativa para guardar en la BD
   */
  saveFile(file: Express.Multer.File, folder: UploadFolder): string {
    // Validar contenido real del archivo
    this.validateMagicBytes(file);

    const folderPath = path.join(this.basePath, folder);

    // Crear carpeta si no existe
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Generar nombre único
    const ext = path.extname(file.originalname).toLowerCase();
    const fileName = `${uuid()}${ext}`;
    const filePath = path.join(folderPath, fileName);

    // Guardar archivo
    fs.writeFileSync(filePath, file.buffer);

    // Retornar ruta relativa
    return `/uploads/${folder}/${fileName}`;
  }

  /**
   * Guarda múltiples archivos
   */
  saveFiles(files: Express.Multer.File[], folder: UploadFolder): string[] {
    return files.map((file) => this.saveFile(file, folder));
  }

  /**
   * Elimina un archivo por su ruta relativa
   */
  deleteFile(relativePath: string): void {
    const fullPath = path.join(process.cwd(), relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}
