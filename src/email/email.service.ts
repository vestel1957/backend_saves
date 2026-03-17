import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly appName = process.env.SMTP_FROM_NAME || 'Admin Panel';

  constructor() {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = port === 465;

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
      logger: true,
      debug: true,
    });
  }

  async onModuleInit() {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP listo para enviar correos');
    } catch (error) {
      this.logger.error('Error verificando SMTP', error);
    }
  }

  private get fromAddress(): string {
    return `"${this.appName}" <${process.env.SMTP_USER || 'noreply@app.com'}>`;
  }

  private baseLayout(content: string): string {
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"></head>
      <body style="margin: 0; padding: 0; background-color: #f0f2f5; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0f2f5; padding: 40px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 32px 40px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: 3px;">${this.appName}</h1>
                    <div style="width: 40px; height: 3px; background: #e94560; margin: 12px auto 0; border-radius: 2px;"></div>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding: 36px 40px 20px;">
                    ${content}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 0 40px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="border-top: 1px solid #edf0f4; padding-top: 20px; text-align: center;">
                          <p style="margin: 0; color: #9ca3af; font-size: 12px;">&copy; ${new Date().getFullYear()} ${this.appName}. Todos los derechos reservados.</p>
                          <p style="margin: 6px 0 0; color: #d1d5db; font-size: 11px;">Este es un correo automático, por favor no respondas a este mensaje.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  async sendResetCode(email: string, code: string, name?: string) {
    const content = `
      <p style="margin: 0 0 8px; font-size: 16px; color: #374151;">Hola${name ? ` <strong>${name}</strong>` : ''},</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
        Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código:
      </p>
      <div style="background: linear-gradient(135deg, #1a1a2e, #0f3460); padding: 24px; text-align: center; border-radius: 12px; margin: 0 0 24px;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #ffffff;">${code}</span>
      </div>
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 0 0 16px;">
        <p style="margin: 0; font-size: 13px; color: #92400e;">
          <strong>Este código expira en 5 minutos.</strong>
        </p>
      </div>
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
    `;

    const mailOptions = {
      from: this.fromAddress,
      to: email,
      subject: `${this.appName} - Código de recuperación de contraseña`,
      html: this.baseLayout(content),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email enviado: ${info.messageId} - ${info.response}`);
      return info;
    } catch (error) {
      this.logger.error('Error enviando email', error);
      throw error;
    }
  }

  async sendAdminPasswordReset(email: string, name?: string) {
    const content = `
      <p style="margin: 0 0 8px; font-size: 16px; color: #374151;">Hola${name ? ` <strong>${name}</strong>` : ''},</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
        Te informamos que un administrador ha restablecido tu contraseña en <strong>${this.appName}</strong>.
      </p>
      <div style="background: #fef2f2; border-left: 4px solid #e94560; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 0 0 16px;">
        <p style="margin: 0; font-size: 13px; color: #991b1b;">
          <strong>Importante:</strong> Si no esperabas este cambio, contacta al administrador de tu organizacion inmediatamente.
        </p>
      </div>
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">Este es un correo informativo generado automaticamente.</p>
    `;

    const mailOptions = {
      from: this.fromAddress,
      to: email,
      subject: `${this.appName} - Tu contraseña ha sido restablecida por un administrador`,
      html: this.baseLayout(content),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email de notificación admin reset enviado: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error('Error enviando email de notificación admin reset', error);
      throw error;
    }
  }

  async sendWelcomeCredentials(email: string, password: string, name?: string) {
    const content = `
      <p style="margin: 0 0 8px; font-size: 16px; color: #374151;">Hola${name ? ` <strong>${name}</strong>` : ''},</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
        Se ha creado tu cuenta en <strong>${this.appName}</strong>. A continuación encontrarás tus credenciales de acceso:
      </p>

      <!-- Credenciales -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 0 0 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding: 0 0 16px;">
              <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; font-weight: 600;">Correo electrónico</p>
              <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">${email}</p>
            </td>
          </tr>
          <tr>
            <td style="border-top: 1px solid #e2e8f0; padding: 16px 0 0;">
              <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; font-weight: 600;">Contraseña temporal</p>
              <div style="background: linear-gradient(135deg, #1a1a2e, #0f3460); padding: 12px 16px; border-radius: 8px; margin-top: 8px; text-align: center;">
                <span style="font-size: 18px; font-weight: 700; letter-spacing: 3px; color: #ffffff;">${password}</span>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Alerta -->
      <div style="background: #fef2f2; border-left: 4px solid #e94560; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 0 0 16px;">
        <p style="margin: 0; font-size: 13px; color: #991b1b;">
          <strong>Importante:</strong> Por seguridad, te recomendamos cambiar tu contraseña después del primer inicio de sesión.
        </p>
      </div>

      <p style="margin: 0; font-size: 13px; color: #9ca3af;">Si no esperabas este correo, por favor contacta al administrador del sistema.</p>
    `;

    const mailOptions = {
      from: this.fromAddress,
      to: email,
      subject: `Bienvenido a ${this.appName} - Tus credenciales de acceso`,
      html: this.baseLayout(content),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email de bienvenida enviado: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error('Error enviando email de bienvenida', error);
      throw error;
    }
  }
}
