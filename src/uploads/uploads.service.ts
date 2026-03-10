import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

export type UploadFolder = 'avatars' | 'signatures' | 'documents';

@Injectable()
export class UploadsService {
  private readonly basePath = path.join(process.cwd(), 'uploads');

  /**
   * Guarda un archivo en la carpeta indicada
   * Retorna la ruta relativa para guardar en la BD
   */
  saveFile(file: Express.Multer.File, folder: UploadFolder): string {
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