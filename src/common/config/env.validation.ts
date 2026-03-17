export function validateEnv() {
  const required: Record<string, string[]> = {
    'Database': ['DATABASE_URL'],
    'Auth': ['JWT_SECRET'],
    'Email (SMTP)': ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'],
  };

  const recommended: Record<string, string[]> = {
    'CORS': ['ALLOWED_IPS'],
    'Server': ['PORT', 'NODE_ENV'],
    'Branding': ['COMPANY_NAME'],
  };

  const missing: string[] = [];

  for (const [group, vars] of Object.entries(required)) {
    for (const v of vars) {
      if (!process.env[v]?.trim()) {
        missing.push(`  - ${v} (${group})`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `\nMissing required environment variables:\n${missing.join('\n')}\n\n` +
      'Set them in your .env file or environment before starting the application.\n',
    );
  }

  const warnings: string[] = [];
  for (const [group, vars] of Object.entries(recommended)) {
    for (const v of vars) {
      if (!process.env[v]?.trim()) {
        warnings.push(`  - ${v} (${group})`);
      }
    }
  }

  if (warnings.length > 0) {
    console.warn(
      `\n[WARNING] Recommended environment variables not set:\n${warnings.join('\n')}\n`,
    );
  }
}
